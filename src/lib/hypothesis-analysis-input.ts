// Monta o material que a IA lê para analisar uma hipótese: respostas dos
// surveys vinculados e transcrições das entrevistas dos roteiros vinculados.
// Textos muito longos são encurtados (início + fim) para caber no limite do
// modelo; o resultado diz quando algo foi cortado ou ficou de fora.
import { db } from "@/db";
import { eq, inArray } from "drizzle-orm";
import { hypotheses, surveyResponses, interviews, interviewGuideQuestions } from "@/db/schema";
import { surveysForHypothesis, guidesForHypothesis } from "@/lib/research-links";
import { computeSurveyResults } from "@/lib/survey-results";
import { interviewLabel } from "@/lib/interview-label";
import type { HypothesisAnalysisInput } from "@/lib/ai";

export type AnalysisSourceMeta = { kind: "survey" | "interview"; id: string; label: string; href: string };

const TOTAL_TRANSCRIPT_BUDGET = 160_000; // caracteres somados de todas as transcrições
const MAX_PER_TRANSCRIPT = 24_000;
const MIN_PER_TRANSCRIPT = 4_000;
const MAX_OPEN_ANSWERS = 25;

function clip(text: string, max: number): { text: string; clipped: boolean } {
  if (text.length <= max) return { text, clipped: false };
  const head = Math.floor(max * 0.7);
  const tail = max - head;
  return {
    text: `${text.slice(0, head)}\n[... trecho do meio omitido por tamanho ...]\n${text.slice(text.length - tail)}`,
    clipped: true,
  };
}

function formatSurveyResults(results: Awaited<ReturnType<typeof computeSurveyResults>>): string {
  return results
    .map((r) => {
      const flag = r.question.leadingFlag ? " [pergunta marcada como INDUTIVA]" : "";
      const head = `${r.question.questionText}${flag} (n=${r.n})`;
      if (r.type === "counts") {
        const parts = Object.entries(r.counts)
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ");
        return `${head} — ${parts || "sem respostas"}`;
      }
      if (r.type === "average") {
        return `${head} — média: ${r.average != null ? r.average.toFixed(2) : "—"}`;
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
        return `${head}:\n${lines.join("\n")}`;
      }
      const texts = r.texts.slice(0, MAX_OPEN_ANSWERS).map((t) => `"${t.slice(0, 400)}"`);
      return `${head} — respostas abertas${r.texts.length > MAX_OPEN_ANSWERS ? ` (primeiras ${MAX_OPEN_ANSWERS} de ${r.texts.length})` : ""}: ${texts.join(" | ") || "nenhuma"}`;
    })
    .join("\n");
}

export async function buildHypothesisAnalysisInput(hypothesisId: string) {
  const [hyp] = await db.select().from(hypotheses).where(eq(hypotheses.id, hypothesisId)).limit(1);
  if (!hyp) throw new Error("Hipótese não encontrada.");

  const [linkedSurveys, linkedGuides] = await Promise.all([
    surveysForHypothesis(hypothesisId),
    guidesForHypothesis(hypothesisId),
  ]);

  const sources: HypothesisAnalysisInput["sources"] = [];
  const meta: AnalysisSourceMeta[] = [];
  const skipped: string[] = [];
  const notes: string[] = [];

  // ----- Surveys (quantitativa)
  for (const s of linkedSurveys) {
    const responses = await db.select({ id: surveyResponses.id }).from(surveyResponses).where(eq(surveyResponses.surveyId, s.id));
    if (responses.length === 0) {
      skipped.push(`Survey "${s.title}" (ainda sem respostas)`);
      continue;
    }
    const results = await computeSurveyResults(s.id);
    const content =
      `Objetivo: ${s.objective || "—"}\nPúblico-alvo: ${s.targetAudience || "—"}\nRespostas: ${responses.length}` +
      (s.sampleTarget ? ` (meta: ${s.sampleTarget})` : "") +
      `\n${formatSurveyResults(results)}`;
    sources.push({ kind: "survey", id: s.id, label: s.title, content });
    meta.push({ kind: "survey", id: s.id, label: s.title, href: `/research/surveys/${s.id}` });
  }

  // ----- Roteiros e entrevistas (qualitativa)
  let context = "";
  type Row = { id: string; guideId: string | null; label: string; text: string };
  const transcripts: Row[] = [];

  if (linkedGuides.length > 0) {
    const guideIds = linkedGuides.map((g) => g.id);
    const [questions, ivs] = await Promise.all([
      db.select().from(interviewGuideQuestions).where(inArray(interviewGuideQuestions.guideId, guideIds)),
      db.select().from(interviews).where(inArray(interviews.guideId, guideIds)),
    ]);

    context = linkedGuides
      .map((g) => {
        const qs = questions
          .filter((q) => q.guideId === g.id)
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((q) => `  ${q.isFollowup ? "  ↳ " : "- "}${q.questionText}`)
          .join("\n");
        return (
          `Roteiro "${g.title}"\n` +
          (g.objective ? `Objetivo: ${g.objective}\n` : "") +
          (g.scenario ? `Cenário: ${g.scenario}\n` : "") +
          (g.jtbdContext ? `JTBD — contexto: ${g.jtbdContext}\n` : "") +
          (g.jtbdMotivation ? `JTBD — motivação: ${g.jtbdMotivation}\n` : "") +
          (g.jtbdObstacle ? `JTBD — obstáculo: ${g.jtbdObstacle}\n` : "") +
          (g.jtbdExpectedOutcome ? `JTBD — resultado esperado: ${g.jtbdExpectedOutcome}\n` : "") +
          (qs ? `Perguntas do roteiro:\n${qs}` : "")
        );
      })
      .join("\n\n")
      .slice(0, 20_000);

    for (const iv of ivs) {
      const label = interviewLabel(iv) || `Entrevista ${iv.id.slice(0, 8)}`;
      const segments = (iv.transcriptSegments ?? []) as { speaker: string; text: string }[];
      const text = (iv.transcript && iv.transcript.trim()) || segments.map((s) => `${s.speaker}: ${s.text}`).join("\n").trim();
      if (!text) {
        skipped.push(`Entrevista "${label}" (sem transcrição registrada)`);
        continue;
      }
      transcripts.push({ id: iv.id, guideId: iv.guideId, label, text });
    }
  }

  if (transcripts.length > 0) {
    const perTranscript = Math.min(
      MAX_PER_TRANSCRIPT,
      Math.max(MIN_PER_TRANSCRIPT, Math.floor(TOTAL_TRANSCRIPT_BUDGET / transcripts.length))
    );
    for (const t of transcripts) {
      const { text, clipped } = clip(t.text, perTranscript);
      if (clipped) notes.push(`A transcrição de "${t.label}" foi encurtada por tamanho.`);
      sources.push({ kind: "interview", id: t.id, label: t.label, content: text });
      meta.push({
        kind: "interview",
        id: t.id,
        label: t.label,
        href: t.guideId ? `/research/interviews/${t.guideId}/interview/${t.id}` : `/research/interviews`,
      });
    }
  }

  const input: HypothesisAnalysisInput = {
    hypothesis: {
      title: hyp.title,
      description: hyp.description,
      type: hyp.type,
      problemRef: hyp.problemRef,
      solutionRef: hyp.solutionRef,
    },
    context,
    sources,
  };
  return { input, meta, skipped, notes };
}
