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
      return `${r.question.questionText} (n=${r.n}) — respostas abertas: ${
        r.texts.slice(0, 5).join(" | ") || "nenhuma"
      }`;
    })
    .join("\n");
}
