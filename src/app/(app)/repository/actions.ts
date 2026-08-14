"use server";

import { db } from "@/db";
import { evidence, hypotheses, hypothesisEvidence, patternAnalyses } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { detectEvidencePatterns } from "@/lib/ai";
import { revalidatePath } from "next/cache";

export async function analyzePatterns() {
  const { user, project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");

  const realEvidence = await db
    .select()
    .from(evidence)
    .where(and(eq(evidence.projectId, project.id), eq(evidence.originClass, "real_data")));

  if (realEvidence.length < 2) {
    throw new Error("É preciso ao menos 2 evidências reais no projeto para procurar padrões entre elas.");
  }

  const evidenceIds = realEvidence.map((e) => e.id);
  const links = await db
    .select()
    .from(hypothesisEvidence)
    .where(inArray(hypothesisEvidence.evidenceId, evidenceIds));
  const hypothesisIds = [...new Set(links.map((l) => l.hypothesisId))];
  const hypothesisList = hypothesisIds.length
    ? await db.select().from(hypotheses).where(inArray(hypotheses.id, hypothesisIds))
    : [];

  const hypothesisTitleFor = (evidenceId: string) => {
    const link = links.find((l) => l.evidenceId === evidenceId);
    if (!link) return "Sem hipótese vinculada";
    return hypothesisList.find((h) => h.id === link.hypothesisId)?.title ?? "Sem hipótese vinculada";
  };

  const items = realEvidence.map((e) => ({
    hypothesisTitle: hypothesisTitleFor(e.id),
    evidenceType: e.type,
    content: e.content,
  }));

  const { data, isMock } = await detectEvidencePatterns(items);

  await db.insert(patternAnalyses).values({
    projectId: project.id,
    patternsJson: data,
    evidenceCountAnalyzed: realEvidence.length,
    isMock,
    createdBy: user.id,
  });

  revalidatePath("/repository");
}
