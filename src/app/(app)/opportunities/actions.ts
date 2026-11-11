"use server";

import { db } from "@/db";
import { opportunities, hypotheses, evidence, hypothesisEvidence, productDocs, userStories } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { checkOpportunityDeletable, deleteBlockedMessage } from "@/lib/delete-guards";
import { getPageContext } from "@/lib/page-context";
import { computePriorityScore } from "@/lib/priority-score";
import { parseTags } from "@/lib/tags";
import { recomputeHypothesis } from "@/lib/recompute-hypothesis";
import { getFeature, updateFeature, withAbTag } from "@/lib/azure-devops";
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

  // Nova oportunidade entra no fim da fila do Discovery Board (depois das que já foram ordenadas à mão).
  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`coalesce(max(${opportunities.boardOrder}), -1)::int` })
    .from(opportunities)
    .where(eq(opportunities.projectId, project.id));

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
      boardOrder: maxOrder + 1,
      tags: parseTags(String(formData.get("tags") || "")),
      createdBy: user.id,
    })
    .returning();

  revalidatePath("/opportunities");
  redirect(`/opportunities/${created.id}`);
}

// Usado a partir da tela de Persona quando uma Oportunidade é uma das
// razões que bloqueiam a exclusão (ver checkPersonaDeletable) — desvincula
// sem apagar a oportunidade (ela continua no Discovery Board, só solta a
// persona).
export async function unlinkPersonaFromOpportunity(opportunityId: string, personaId: string) {
  const { role } = await getPageContext();
  if (role !== "owner" && role !== "editor") throw new Error("Sem permissão.");
  await db.update(opportunities).set({ personaId: null }).where(eq(opportunities.id, opportunityId));
  revalidatePath("/opportunities", "layout");
  revalidatePath(`/personas/${personaId}`);
}

// Usado a partir da tela de Hipótese quando uma Oportunidade é uma das
// razões que bloqueiam a exclusão (ver checkHypothesisDeletable) —
// desvincula sem apagar a oportunidade (ela continua no Discovery Board, só
// solta a hipótese).
export async function unlinkHypothesisFromOpportunity(opportunityId: string, hypothesisId: string) {
  const { role } = await getPageContext();
  if (role !== "owner" && role !== "editor") throw new Error("Sem permissão.");
  await db.update(opportunities).set({ hypothesisId: null }).where(eq(opportunities.id, opportunityId));
  revalidatePath("/opportunities", "layout");
  revalidatePath(`/hypotheses/${hypothesisId}`);
}

// Campos a gravar ao mudar o status. Marca quando a oportunidade virou "done"
// — é o gatilho do ciclo de acompanhamento pós-lançamento (ver
// checkForOutcomeFollowUps no dashboard). Se ela sair de "done" de novo, limpa
// tudo: o acompanhamento não faz sentido para algo que não está mais concluído.
function statusUpdates(previous: string | undefined, status: string): Record<string, unknown> {
  const updates: Record<string, unknown> = { status };
  if (status === "done" && previous !== "done") {
    updates.doneAt = new Date();
  } else if (status !== "done" && previous === "done") {
    updates.doneAt = null;
    updates.outcomeCheckedAt = null;
    updates.outcomeSummary = null;
    updates.outcomeEvidenceId = null;
  }
  return updates;
}

export async function updateOpportunityStatus(opportunityId: string, formData: FormData) {
  const { role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  const status = String(formData.get("status") || "new");

  const [existing] = await db.select().from(opportunities).where(eq(opportunities.id, opportunityId)).limit(1);

  await db.update(opportunities).set(statusUpdates(existing?.status, status) as never).where(eq(opportunities.id, opportunityId));
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

export async function updateOpportunityTags(opportunityId: string, formData: FormData) {
  const { project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");

  const tags = parseTags(String(formData.get("tags") || ""));
  await db
    .update(opportunities)
    .set({ tags })
    .where(and(eq(opportunities.id, opportunityId), eq(opportunities.projectId, project.id)));

  revalidatePath(`/opportunities/${opportunityId}`);
  revalidatePath("/opportunities");
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

// Datas de planejamento usadas só pelo Gráfico Gantt de roadmap (ver
// /azure-devops/roadmap) — não existe campo nativo garantido de Start/Target
// Date no Azure DevOps (depende do processo configurado lá), então o
// discovery-app guarda e mostra essas datas por conta própria.
export async function updatePlannedDates(opportunityId: string, formData: FormData) {
  const { role } = await getPageContext();
  if (role !== "owner") throw new Error("Só administradores (Owner) podem editar a timeline do roadmap.");

  const startRaw = String(formData.get("plannedStartDate") || "");
  const endRaw = String(formData.get("plannedEndDate") || "");
  const plannedStartDate = startRaw ? new Date(startRaw) : null;
  const plannedEndDate = endRaw ? new Date(endRaw) : null;

  if (plannedStartDate && plannedEndDate && plannedEndDate < plannedStartDate) {
    throw new Error("A data de entrega não pode ser antes da data de início.");
  }

  await db.update(opportunities).set({ plannedStartDate, plannedEndDate }).where(eq(opportunities.id, opportunityId));
  revalidatePath("/azure-devops/roadmap");
  revalidatePath(`/opportunities/${opportunityId}`);
}

// Decisão de "sucesso da funcionalidade" pós-teste A/B: continua em teste,
// deve ser mantida permanentemente, ou deve ser removida. Guardada aqui no
// discovery-app e espelhada como tag no card do Azure DevOps (prefixo "ab:")
// quando a oportunidade já tiver sido enviada como Feature — assim aparece
// direto no board pra quem só olha o Azure DevOps.
export async function setAbTestDecision(opportunityId: string, formData: FormData) {
  const { project, role } = await getPageContext();
  if (role !== "owner") throw new Error("Só administradores (Owner) podem registrar esta decisão.");

  const decision = String(formData.get("abTestDecision") || "testing") as "testing" | "keep" | "remove";
  if (!["testing", "keep", "remove"].includes(decision)) throw new Error("Decisão inválida.");

  const [opp] = await db.select().from(opportunities).where(eq(opportunities.id, opportunityId)).limit(1);
  if (!opp || opp.projectId !== project.id) throw new Error("Oportunidade não encontrada.");

  await db.update(opportunities).set({ abTestDecision: decision }).where(eq(opportunities.id, opportunityId));

  if (opp.azureFeatureId) {
    const feature = await getFeature(opp.azureFeatureId);
    await updateFeature(opp.azureFeatureId, { tags: withAbTag(feature.tags, decision) });
  }

  revalidatePath(`/opportunities/${opportunityId}`);
  revalidatePath("/azure-devops");
  revalidatePath("/azure-devops/roadmap");
}

const BOARD_STATUSES = ["new", "prioritized", "in_progress", "done", "archived"];

// ---------------------------------------------------------------------------
// Excluir oportunidade. O PRD e TODAS as user stories dela são apagados junto
// (tudo numa transação). Só bloqueia se houver decisão registrada ligada a ela
// (Decision Log é histórico). A Feature já criada no Azure DevOps NÃO é
// apagada daqui — isso é feito lá (ou em /azure-devops).
// ---------------------------------------------------------------------------
async function performOpportunityDeletion(opportunityId: string) {
  const { project, role } = await getPageContext();
  if (role !== "owner" && role !== "editor") throw new Error("Sem permissão para excluir.");

  const [opp] = await db.select().from(opportunities).where(eq(opportunities.id, opportunityId)).limit(1);
  if (!opp || opp.projectId !== project.id) throw new Error("Oportunidade não encontrada.");

  const reasons = await checkOpportunityDeletable(opportunityId);
  if (reasons.length > 0) throw new Error(deleteBlockedMessage("esta oportunidade", reasons));

  await db.transaction(async (tx) => {
    // O banco já apaga em cascata; fazemos explícito para não depender disso.
    await tx.delete(userStories).where(eq(userStories.opportunityId, opportunityId));
    await tx.delete(productDocs).where(eq(productDocs.opportunityId, opportunityId));
    await tx.delete(opportunities).where(eq(opportunities.id, opportunityId));
  });

  revalidatePath("/opportunities", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/azure-devops");
  revalidatePath("/azure-devops/roadmap");
}

// Botão "Excluir" da página da oportunidade. Em caso de erro, volta para a
// própria página mostrando o motivo (em produção o Next esconde mensagens de
// erro de Server Action, por isso o redirect com ?erro=).
export async function deleteOpportunity(opportunityId: string) {
  try {
    await performOpportunityDeletion(opportunityId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Não foi possível excluir a oportunidade.";
    redirect(`/opportunities/${opportunityId}?erro=${encodeURIComponent(msg)}`);
  }
  redirect("/opportunities");
}

// Botão "excluir" direto no card do board: devolve o resultado em vez de
// lançar erro, para a tela mostrar o motivo.
export async function deleteOpportunityFromList(opportunityId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await performOpportunityDeletion(opportunityId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Não foi possível excluir a oportunidade." };
  }
}

// ---------------------------------------------------------------------------
// Ordem manual no Discovery Board (arrastar e soltar).
// ---------------------------------------------------------------------------
// Regrava boardOrder = índice na lista, só para ids do projeto atual.
async function applyBoardOrder(projectId: string, orderedIds: string[]) {
  if (orderedIds.length === 0) return;
  const owned = await db
    .select({ id: opportunities.id })
    .from(opportunities)
    .where(and(inArray(opportunities.id, orderedIds), eq(opportunities.projectId, projectId)));
  const ownedIds = new Set(owned.map((o) => o.id));
  await Promise.all(
    orderedIds
      .map((id, index) => ({ id, index }))
      .filter(({ id }) => ownedIds.has(id))
      .map(({ id, index }) => db.update(opportunities).set({ boardOrder: index }).where(eq(opportunities.id, id)))
  );
}

// Soltar dentro da mesma coluna: só muda a ordem (topo = mais prioritário).
export async function reorderOpportunities(orderedIds: string[]) {
  const { project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Viewers não podem reordenar oportunidades.");
  await applyBoardOrder(project.id, orderedIds);
  revalidatePath("/opportunities");
}

// Soltar em outra coluna: muda o status e grava a ordem da coluna de destino.
export async function moveOpportunityToColumn(opportunityId: string, newStatus: string, orderedIds: string[]) {
  const { project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Viewers não podem mover oportunidades.");
  if (!BOARD_STATUSES.includes(newStatus)) throw new Error("Coluna inválida.");

  const [existing] = await db.select().from(opportunities).where(eq(opportunities.id, opportunityId)).limit(1);
  if (!existing || existing.projectId !== project.id) throw new Error("Oportunidade não encontrada.");

  await db.update(opportunities).set(statusUpdates(existing.status, newStatus) as never).where(eq(opportunities.id, opportunityId));
  await applyBoardOrder(project.id, orderedIds);
  revalidatePath("/opportunities", "layout");
  revalidatePath("/dashboard");
}
