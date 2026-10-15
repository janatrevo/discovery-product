"use server";

import { db } from "@/db";
import { hypotheses, hypothesisAiAnalyses } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { analyzeHypothesisResearch } from "@/lib/ai";
import { buildHypothesisAnalysisInput } from "@/lib/hypothesis-analysis-input";
import { revalidatePath } from "next/cache";

// "Analisar com IA": lê as pesquisas vinculadas à hipótese e guarda a
// sugestão (favorável / contrária / mista / insuficiente). Não cria
// evidência e não mexe na confiança — só a pessoa faz isso, depois de
// conferir, registrando a evidência na própria pesquisa.
export async function analyzeHypothesisWithAi(hypothesisId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { user, project, role } = await getPageContext();
    if (role === "viewer") return { ok: false, error: "Sem permissão." };

    const [hyp] = await db.select().from(hypotheses).where(eq(hypotheses.id, hypothesisId)).limit(1);
    if (!hyp || hyp.projectId !== project.id) return { ok: false, error: "Hipótese não encontrada." };

    const { input, meta, skipped, notes } = await buildHypothesisAnalysisInput(hypothesisId);
    if (input.sources.length === 0) {
      return {
        ok: false,
        error:
          "Não há nada para analisar ainda: vincule um survey com respostas ou um roteiro com entrevistas transcritas a esta hipótese." +
          (skipped.length ? ` Ignorados: ${skipped.join("; ")}.` : ""),
      };
    }

    const { data, modelVersion } = await analyzeHypothesisResearch(input);
    if (skipped.length) data.caveats.push(...skipped.map((s) => `Não analisado: ${s}.`));
    if (notes.length) data.caveats.push(...notes);

    await db.insert(hypothesisAiAnalyses).values({
      hypothesisId,
      verdict: data.verdict,
      result: data,
      sources: meta,
      modelVersion,
      createdBy: user.id,
    });

    revalidatePath(`/hypotheses/${hypothesisId}`);
    return { ok: true };
  } catch (err) {
    console.error("Erro ao analisar hipótese com IA:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Não foi possível analisar agora." };
  }
}
