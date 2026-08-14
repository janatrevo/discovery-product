"use server";

import { db } from "@/db";
import { evidence, hypothesisEvidence } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { recomputeHypothesis } from "@/lib/recompute-hypothesis";
import { revalidatePath } from "next/cache";

export async function addEvidence(hypothesisId: string, formData: FormData) {
  const { user, project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Viewers não podem adicionar evidência.");

  const sampleSizeRaw = formData.get("sampleSize");

  const [created] = await db
    .insert(evidence)
    .values({
      projectId: project.id,
      source: String(formData.get("source") || ""),
      type: String(formData.get("type") || "manual"),
      context: String(formData.get("context") || ""),
      content: String(formData.get("content") || ""),
      personaId: String(formData.get("personaId") || "") || null,
      sampleSize: sampleSizeRaw ? Number(sampleSizeRaw) : null,
      qualityScore: Number(formData.get("qualityScore") || 70),
      reliabilityScore: Number(formData.get("reliabilityScore") || 70),
      // origin_class é SEMPRE real_data quando inserido manualmente por um
      // humano neste formulário — nunca editável para vir de um módulo de IA
      // por aqui (simulação e IA escrevem em suas próprias tabelas).
      originClass: "real_data",
      originMethod: String(formData.get("type") || "manual"),
      generatedBy: "human",
      createdBy: user.id,
    })
    .returning();

  await db.insert(hypothesisEvidence).values({
    hypothesisId,
    evidenceId: created.id,
    favorable: formData.get("favorable") === "true",
  });

  await recomputeHypothesis(hypothesisId, user.id);
  revalidatePath(`/hypotheses/${hypothesisId}`);
}

export async function unlinkEvidence(hypothesisId: string, evidenceId: string) {
  const { user, role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  await db
    .delete(hypothesisEvidence)
    .where(and(eq(hypothesisEvidence.hypothesisId, hypothesisId), eq(hypothesisEvidence.evidenceId, evidenceId)));
  await recomputeHypothesis(hypothesisId, user.id);
  revalidatePath(`/hypotheses/${hypothesisId}`);
}

export async function linkExistingEvidence(hypothesisId: string, formData: FormData) {
  const { user, role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  const evidenceId = String(formData.get("evidenceId") || "");
  const favorable = formData.get("favorable") === "true";
  if (!evidenceId) return;
  await db.insert(hypothesisEvidence).values({ hypothesisId, evidenceId, favorable }).onConflictDoNothing();
  await recomputeHypothesis(hypothesisId, user.id);
  revalidatePath(`/hypotheses/${hypothesisId}`);
}
