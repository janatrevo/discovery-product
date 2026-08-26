import { db } from "@/db";
import { surveyQuestions, surveyAnswers } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function computeSurveyResults(surveyId: string) {
  const questions = await db
    .select()
    .from(surveyQuestions)
    .where(eq(surveyQuestions.surveyId, surveyId))
    .orderBy(surveyQuestions.orderIndex);

  const results = await Promise.all(
    questions.map(async (q) => {
      const answers = await db.select().from(surveyAnswers).where(eq(surveyAnswers.questionId, q.id));
      const values = answers.map((a) => a.answerValue);

      if (["single_choice", "multi_choice", "demographic", "frequency"].includes(q.questionType)) {
        const counts: Record<string, number> = {};
        for (const v of values) {
          const arr = Array.isArray(v) ? v : [v];
          for (const item of arr) {
            const key = String(item);
            counts[key] = (counts[key] ?? 0) + 1;
          }
        }
        return { question: q, type: "counts" as const, counts, n: answers.length };
      }

      if (["likert", "nps", "purchase_intent"].includes(q.questionType)) {
        const nums = values.map((v) => Number(v)).filter((n) => !Number.isNaN(n));
        const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
        return { question: q, type: "average" as const, average: avg, n: answers.length, raw: nums };
      }

      // Matriz: cada resposta é { "linha": ["coluna", ...] } (ver
      // submitSurveyResponse em research/surveys/actions.ts) — conta
      // quantas vezes cada coluna foi marcada, por linha.
      if (q.questionType === "matrix") {
        const rows = (q.matrixRows as string[]) ?? [];
        const cols = (q.options as string[]) ?? [];
        const counts: Record<string, Record<string, number>> = {};
        for (const row of rows) {
          counts[row] = {};
          for (const col of cols) counts[row][col] = 0;
        }
        for (const v of values) {
          if (!v || typeof v !== "object" || Array.isArray(v)) continue;
          for (const [row, selected] of Object.entries(v as Record<string, unknown>)) {
            if (!counts[row]) counts[row] = {};
            const arr = Array.isArray(selected) ? selected : [selected];
            for (const col of arr) {
              const key = String(col);
              counts[row][key] = (counts[row][key] ?? 0) + 1;
            }
          }
        }
        return { question: q, type: "matrix" as const, rows, cols, counts, n: answers.length };
      }

      return { question: q, type: "text" as const, texts: values.map(String), n: answers.length };
    })
  );

  return results;
}

// Resumo textual determinístico dos resultados — usado como `content` da
// Evidência quando um survey é "promovido" (ver promoteSurveyToEvidence).
export function summarizeSurveyResults(results: Awaited<ReturnType<typeof computeSurveyResults>>): string {
  return results
    .map((r) => {
      if (r.type === "counts") {
        const parts = Object.entries(r.counts)
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ");
        return `${r.question.questionText} (n=${r.n}) — ${parts || "sem respostas"}`;
      }
      if (r.type === "average") {
        return `${r.question.questionText} (n=${r.n}) — média: ${r.average != null ? r.average.toFixed(1) : "—"}`;
      }
      if (r.type === "matrix") {
        const lines = r.rows.map((row) => {
          const rowCounts = r.counts[row] ?? {};
          const parts = Object.entries(rowCounts)
            .filter(([, v]) => v > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ");
          return `  - ${row} — ${parts || "sem respostas"}`;
        });
        return `${r.question.questionText} (n=${r.n}):\n${lines.join("\n")}`;
      }
      return `${r.question.questionText} (n=${r.n}) — respostas abertas: ${
        r.texts.slice(0, 5).join(" | ") || "nenhuma"
      }`;
    })
    .join("\n");
}
