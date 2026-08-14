"use server";

import { db } from "@/db";
import { opportunities, hypotheses, evidence, hypothesisEvidence } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { computePriorityScore } from "@/lib/priority-score";
import { recomputeHypothesis } from "@/lib/recompute-hypothesis";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

function readScores(formData: FormData) {
  const num = (name: string, fallback = 3) => {
    const v = Number(formData.get(name));
    return Number.isFinite(v) && v >= 1 && v <= 5 ? v : fallback;
  };
  return {
    impact: num("impact"),
    frequency: num("frequency"),
    severity: num("severity"),
    businessPotential: num("businessPotential"),
    solutionEase: num("solutionEase"),
  };
}

export async function createOpportunity(formData: FormData) {
  const { user, project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Viewers não podem criar oportunidades.");

  const hypothesisId = String(formData.get("hypothesisId") || "") || null;
  const personaId = String(formData.get("personaId") || "") || null;
  const problemRef = String(formData.get("problemRef") || "").trim();
  const scores = readScores(formData);

  // Governança: sem hipótese vinculada, a oportunidade precisa de uma
  // referência mínima do problema observado — nunca pode ficar sem
  // nenhum lastro de evidência/origem.
  if (!hypothesisId && !problemRef) {
    throw new Error(
      "Oportunidades sem hipótese vinculada precisam de uma referência do problema observado (campo 'Referência do problema')."
    );
  }

  let evidenceConfidence = 0;
  if (hypothesisId) {
    const [hyp] = await db.select().from(hypotheses).where(eq(hypotheses.id, hypothesisId)).limit(1);
    if (hyp?.confidenceScore) evidenceConfidence = Number(hyp.confidenceScore);
  }

  const priorityScore = computePriorityScore({ ...scores, evidenceConfidence });

  const [created] = await db
    .insert(opportunities)
    .values({
      projectId: project.id,
      hypothesisId,
      personaId,
      title: String(formData.get("title") || ""),
      description: String(formData.get("description") || ""),
      problemRef,
      ...scores,
      evidenceConfidence: Math.round(evidenceConfidence),
      priorityScore: String(priorityScore),
      createdBy: user.id,
    })
    .returning();

  revalidatePath("/opportunities");
  redirect(`/opportunities/${created.id}`);
}

export async function updateOpportunityStatus(opportunityId: string, formData: FormData) {
  const { role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  const status = String(formData.get("status") || "new") as never;

  const [existing] = await db.select().from(opportunities).where(eq(opportunities.id, opportunityId)).limit(1);

  // Marca quando a oportunidade virou "done" — é o gatilho do ciclo de
  // acompanhamento pós-lançamento (ver checkForOutcomeFollowUps no
  // dashboard). Se ela sair de "done" de novo, limpa tudo: o
  // acompanhamento não faz sentido para algo que não está mais concluído.
  const updates: Record<string, unknown> = { status };
  if (status === "done" && existing?.status !== "done") {
    updates.doneAt = new Date();
  } else if (status !== "done" && existing?.status === "done") {
    updates.doneAt = null;
    updates.outcomeCheckedAt = null;
    updates.outcomeSummary = null;
    updates.outcomeEvidenceId = null;
  }

  await db.update(opportunities).set(updates).where(eq(opportunities.id, opportunityId));
  revalidatePath("/opportunities", "layout");
  revalidatePath("/dashboard");
}

// Fecha o ciclo discovery → entrega → aprendizado: registra o que de fato
// aconteceu depois do lançamento e, opcionalmente, transforma isso em
// Evidência real vinculada de volta à hipótese de origem — para que o
// resultado real (não só a suposição inicial) conte no Confidence Score.
export async function recordOpportunityOutcome(opportunityId: string, formData: FormData) {
  const { user, project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");

  const [opp] = await db.select().from(opportunities).where(eq(opportunities.id, opportunityId)).limit(1);
  if (!opp || opp.projectId !== project.id) throw new Error("Oportunidade não encontrada.");
  if (opp.status !== "done") throw new Error("Só é possível registrar resultado de uma oportunidade concluída.");

  const outcomeSummary = String(formData.get("outcomeSummary") || "").trim();
  if (!outcomeSummary) throw new Error("Descreva o que de fato aconteceu depois do lançamento.");

  const logAsEvidence = formData.get("logAsEvidence") === "true";
  let outcomeEvidenceId: string | null = null;

  if (logAsEvidence && opp.hypothesisId) {
    const favorable = formData.get("outcomeFavorable") === "true";
    const [createdEvidence] = await db
      .insert(evidence)
      .values({
        projectId: project.id,
        source: `Resultado pós-lançamento: ${opp.title}`,
        type: "behavioral",
        content: outcomeSummary,
        originClass: "real_data",
        originMethod: "post_launch_outcome",
        generatedBy: "human",
        qualityScore: 70,
        reliabilityScore: 70,
        createdBy: user.id,
      })
      .returning();
    outcomeEvidenceId = createdEvidence.id;
    await db.insert(hypothesisEvidence).values({ hypothesisId: opp.hypothesisId, evidenceId: createdEvidence.id, favorable });
    await recomputeHypothesis(opp.hypothesisId, user.id);
  }

  await db
    .update(opportunities)
    .set({ outcomeCheckedAt: new Date(), outcomeSummary, outcomeEvidenceId })
    .where(eq(opportunities.id, opportunityId));

  revalidatePath(`/opportunities/${opportunityId}`);
  revalidatePath("/dashboard");
  if (opp.hypothesisId) revalidatePath(`/hypotheses/${opp.hypothesisId}`);
}

export async function updateOpportunityScores(opportunityId: string, formData: FormData) {
  const { role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");

  const [existing] = await db.select().from(opportunities).where(eq(opportunities.id, opportunityId)).limit(1);
  if (!existing) throw new Error("Oportunidade não encontrada.");

  const scores = readScores(formData);
  const priorityScore = computePriorityScore({ ...scores, evidenceConfidence: existing.evidenceConfidence });

  await db
    .update(opportunities)
    .set({
      title: String(formData.get("title") || existing.title),
      description: String(formData.get("description") || existing.description || ""),
      ...scores,
      priorityScore: String(priorityScore),
    })
    .where(eq(opportunities.id, opportunityId));

  revalidatePath(`/opportunities/${opportunityId}`);
  revalidatePath("/opportunities");
}
