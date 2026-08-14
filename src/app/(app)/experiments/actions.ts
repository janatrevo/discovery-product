"use server";

import { db } from "@/db";
import { experiments, evidence, hypothesisEvidence } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { recomputeHypothesis } from "@/lib/recompute-hypothesis";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function createExperiment(hypothesisId: string, formData: FormData) {
  const { user, project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");

  const [created] = await db
    .insert(experiments)
    .values({
      projectId: project.id,
      hypothesisId,
      objective: String(formData.get("objective") || ""),
      personaId: String(formData.get("personaId") || "") || null,
      variable: String(formData.get("variable") || ""),
      method: String(formData.get("method") || "interview") as never,
      metric: String(formData.get("metric") || ""),
      samplePlanned: Number(formData.get("samplePlanned") || 0) || null,
      resultExpected: String(formData.get("resultExpected") || ""),
      createdBy: user.id,
    })
    .returning();

  revalidatePath(`/hypotheses/${hypothesisId}`);
  redirect(`/experiments/${created.id}`);
}

// Trava o critério de sucesso ANTES do resultado — o timestamp impede
// preencher o critério depois de já saber o resultado (seção 12).
export async function lockSuccessCriteria(experimentId: string, formData: FormData) {
  const { role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  const [exp] = await db.select().from(experiments).where(eq(experiments.id, experimentId)).limit(1);
  if (!exp) throw new Error("Experimento não encontrado.");
  if (exp.resultRecordedAt) throw new Error("Já há resultado registrado — não é possível travar o critério retroativamente.");

  await db
    .update(experiments)
    .set({
      successCriteria: String(formData.get("successCriteria") || ""),
      successCriteriaLockedAt: new Date(),
      status: "in_progress",
    })
    .where(eq(experiments.id, experimentId));
  revalidatePath(`/experiments/${experimentId}`);
}

export async function recordResult(experimentId: string, formData: FormData) {
  const { user, role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  const [exp] = await db.select().from(experiments).where(eq(experiments.id, experimentId)).limit(1);
  if (!exp) throw new Error("Experimento não encontrado.");
  if (!exp.successCriteriaLockedAt) {
    throw new Error("Defina e trave o critério de sucesso antes de registrar o resultado.");
  }

  const conclusion = String(formData.get("conclusion") || "");
  const createEvidenceFlag = formData.get("createEvidence") === "true";

  await db
    .update(experiments)
    .set({
      resultObserved: String(formData.get("resultObserved") || ""),
      sampleActual: Number(formData.get("sampleActual") || 0) || null,
      conclusion,
      nextStep: String(formData.get("nextStep") || ""),
      status: "completed",
      resultRecordedAt: new Date(),
    })
    .where(eq(experiments.id, experimentId));

  if (createEvidenceFlag) {
    const [ev] = await db
      .insert(evidence)
      .values({
        projectId: exp.projectId,
        source: `Experimento — ${exp.method}`,
        type: "experiment",
        personaId: exp.personaId,
        context: exp.objective,
        content: `${String(formData.get("resultObserved") || "")}\n\nConclusão: ${conclusion}`,
        sampleSize: Number(formData.get("sampleActual") || 0) || exp.samplePlanned,
        qualityScore: 80,
        reliabilityScore: 80,
        originClass: "real_data",
        originMethod: exp.method,
        generatedBy: "human",
        createdBy: user.id,
      })
      .returning();

    await db.insert(hypothesisEvidence).values({
      hypothesisId: exp.hypothesisId,
      evidenceId: ev.id,
      favorable: formData.get("favorable") !== "false",
    });
    await recomputeHypothesis(exp.hypothesisId, user.id);
  }

  revalidatePath(`/experiments/${experimentId}`);
  revalidatePath(`/hypotheses/${exp.hypothesisId}`);
}
