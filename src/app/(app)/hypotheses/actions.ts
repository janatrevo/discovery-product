"use server";

import { db } from "@/db";
import {
  hypotheses,
  hypothesisPersonas,
  hypothesisProducts,
  hypothesisHistory,
  experiments,
  opportunities,
  usabilityTests,
  usabilityFindings,
  simulationRuns,
  surveys,
  interviewGuides,
} from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { checkHypothesisDeletable, deleteBlockedMessage } from "@/lib/delete-guards";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function createHypothesis(formData: FormData) {
  const { user, project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Viewers não podem criar hipóteses.");

  const personaIds = formData.getAll("personaIds").map(String).filter(Boolean);
  const productIds = formData.getAll("productIds").map(String).filter(Boolean);

  const [created] = await db
    .insert(hypotheses)
    .values({
      projectId: project.id,
      title: String(formData.get("title") || ""),
      description: String(formData.get("description") || ""),
      type: String(formData.get("type") || "problem") as never,
      problemRef: String(formData.get("problemRef") || ""),
      solutionRef: String(formData.get("solutionRef") || ""),
      relatedHypothesisId: String(formData.get("relatedHypothesisId") || "") || null,
      context: String(formData.get("context") || ""),
      validationMethod: String(formData.get("validationMethod") || ""),
      ownerId: user.id,
      createdBy: user.id,
    })
    .returning();

  if (personaIds.length) {
    await db.insert(hypothesisPersonas).values(personaIds.map((personaId) => ({ hypothesisId: created.id, personaId })));
  }
  if (productIds.length) {
    await db.insert(hypothesisProducts).values(productIds.map((productId) => ({ hypothesisId: created.id, productId })));
  }
  await db.insert(hypothesisHistory).values({
    hypothesisId: created.id,
    fieldChanged: "created",
    newValue: created.title,
    changedBy: user.id,
  });

  revalidatePath("/hypotheses");
  redirect(`/hypotheses/${created.id}`);
}

export async function updateHypothesis(hypothesisId: string, formData: FormData) {
  const { user, role } = await getPageContext();
  if (role === "viewer") throw new Error("Viewers não podem editar hipóteses.");

  const [existing] = await db.select().from(hypotheses).where(eq(hypotheses.id, hypothesisId)).limit(1);
  if (!existing) throw new Error("Hipótese não encontrada.");

  const next = {
    title: String(formData.get("title") || existing.title),
    description: String(formData.get("description") || ""),
    type: String(formData.get("type") || existing.type) as never,
    problemRef: String(formData.get("problemRef") || ""),
    solutionRef: String(formData.get("solutionRef") || ""),
    relatedHypothesisId: String(formData.get("relatedHypothesisId") || "") || null,
    context: String(formData.get("context") || ""),
    validationMethod: String(formData.get("validationMethod") || ""),
    updatedAt: new Date(),
  };

  const historyEntries = [];
  for (const field of ["title", "type", "description"] as const) {
    if (String(existing[field] ?? "") !== String(next[field] ?? "")) {
      historyEntries.push({
        hypothesisId,
        fieldChanged: field,
        oldValue: String(existing[field] ?? ""),
        newValue: String(next[field] ?? ""),
        changedBy: user.id,
      });
    }
  }

  const personaIds = formData.getAll("personaIds").map(String).filter(Boolean);
  await db.delete(hypothesisPersonas).where(eq(hypothesisPersonas.hypothesisId, hypothesisId));
  if (personaIds.length) {
    await db.insert(hypothesisPersonas).values(personaIds.map((personaId) => ({ hypothesisId, personaId })));
  }

  await db.update(hypotheses).set(next).where(eq(hypotheses.id, hypothesisId));
  if (historyEntries.length) await db.insert(hypothesisHistory).values(historyEntries);

  revalidatePath(`/hypotheses/${hypothesisId}`);
  redirect(`/hypotheses/${hypothesisId}`);
}

export async function overrideStatus(hypothesisId: string, formData: FormData) {
  const { user, role } = await getPageContext();
  if (role !== "owner" && role !== "editor") throw new Error("Sem permissão para forçar status.");

  const [existing] = await db.select().from(hypotheses).where(eq(hypotheses.id, hypothesisId)).limit(1);
  if (!existing) throw new Error("Hipótese não encontrada.");

  const newStatus = String(formData.get("status") || "");
  const reason = String(formData.get("reason") || "");
  if (!reason.trim()) throw new Error("Justificativa obrigatória para forçar uma transição de status.");

  await db
    .update(hypotheses)
    .set({ status: newStatus as never, statusOverridden: true, statusOverrideReason: reason, updatedAt: new Date() })
    .where(eq(hypotheses.id, hypothesisId));

  await db.insert(hypothesisHistory).values({
    hypothesisId,
    fieldChanged: "status",
    oldValue: existing.status,
    newValue: newStatus,
    note: reason,
    isOverride: true,
    changedBy: user.id,
  });

  revalidatePath(`/hypotheses/${hypothesisId}`);
  redirect(`/hypotheses/${hypothesisId}`);
}

export async function clearOverride(hypothesisId: string) {
  const { role } = await getPageContext();
  if (role !== "owner" && role !== "editor") throw new Error("Sem permissão.");
  await db
    .update(hypotheses)
    .set({ statusOverridden: false, statusOverrideReason: null })
    .where(eq(hypotheses.id, hypothesisId));
  revalidatePath(`/hypotheses/${hypothesisId}`);
}

// Exclui a hipótese. Só o Decision Log bloqueia (ver checkHypothesisDeletable).
// Apagados junto: experimentos, oportunidades, testes de usabilidade e
// simulações dela. Só desvinculados (continuam existindo): surveys, roteiros
// de entrevista, achados de usabilidade, personas, evidências e entrevistas.
// Tudo numa transação — se algo falhar, nada é apagado pela metade.
async function performHypothesisDeletion(hypothesisId: string) {
  const { project, role } = await getPageContext();
  if (role !== "owner" && role !== "editor") throw new Error("Sem permissão para excluir.");

  const [hyp] = await db.select().from(hypotheses).where(eq(hypotheses.id, hypothesisId)).limit(1);
  if (!hyp || hyp.projectId !== project.id) throw new Error("Hipótese não encontrada.");

  const reasons = await checkHypothesisDeletable(hypothesisId);
  if (reasons.length > 0) throw new Error(deleteBlockedMessage("esta hipótese", reasons));

  await db.transaction(async (tx) => {
    // Apagados junto (os filhos deles caem em cascata pelo banco).
    await tx.delete(experiments).where(eq(experiments.hypothesisId, hypothesisId));
    await tx.delete(opportunities).where(eq(opportunities.hypothesisId, hypothesisId));
    await tx.delete(usabilityTests).where(eq(usabilityTests.hypothesisId, hypothesisId));
    await tx.delete(simulationRuns).where(eq(simulationRuns.hypothesisId, hypothesisId));
    // Só desvinculados.
    await tx.update(surveys).set({ hypothesisId: null }).where(eq(surveys.hypothesisId, hypothesisId));
    await tx.update(interviewGuides).set({ hypothesisId: null }).where(eq(interviewGuides.hypothesisId, hypothesisId));
    await tx.update(usabilityFindings).set({ hypothesisId: null }).where(eq(usabilityFindings.hypothesisId, hypothesisId));
    // Vínculos N:N (pesquisas, evidências, personas, produtos) e histórico
    // caem em cascata junto com a hipótese.
    await tx.delete(hypotheses).where(eq(hypotheses.id, hypothesisId));
  });

  revalidatePath("/hypotheses");
  revalidatePath("/experiments");
  revalidatePath("/opportunities");
  revalidatePath("/research/surveys");
  revalidatePath("/research/interviews");
}

// Botão "Excluir" da página da hipótese: exclui e volta para a lista.
export async function deleteHypothesis(hypothesisId: string) {
  await performHypothesisDeletion(hypothesisId);
  redirect("/hypotheses");
}

// Botão "excluir" direto no card da lista (board): devolve o resultado em vez
// de lançar erro, para a tela mostrar o motivo (ex.: hipótese citada numa
// decisão) sem tela de erro.
export async function deleteHypothesisFromList(hypothesisId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await performHypothesisDeletion(hypothesisId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Não foi possível excluir a hipótese." };
  }
}

// Regrava priorityOrder = índice na lista para os ids informados, mas só
// para os que de fato pertencem ao projeto atual (defesa contra um cliente
// adulterado enviando ids de outro projeto). Compartilhada por
// reorderHypotheses (mesma coluna) e moveHypothesisToColumn (coluna nova).
async function applyPriorityOrder(projectId: string, orderedIds: string[]) {
  if (orderedIds.length === 0) return;
  const owned = await db
    .select({ id: hypotheses.id })
    .from(hypotheses)
    .where(and(inArray(hypotheses.id, orderedIds), eq(hypotheses.projectId, projectId)));
  const ownedIds = new Set(owned.map((h) => h.id));

  await Promise.all(
    orderedIds
      .map((hypothesisId, index) => ({ hypothesisId, index }))
      .filter(({ hypothesisId }) => ownedIds.has(hypothesisId))
      .map(({ hypothesisId, index }) =>
        db.update(hypotheses).set({ priorityOrder: index }).where(eq(hypotheses.id, hypothesisId))
      )
  );
}

// Chamada direto pelo componente cliente de drag-and-drop
// (hypothesis-priority-column.tsx) depois de soltar um card dentro da mesma
// coluna — não é uma <form action>, é uma Server Action invocada como
// função normal. orderedIds já vem na ordem final desejada (topo = mais
// prioritário).
export async function reorderHypotheses(orderedIds: string[]) {
  const { project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Viewers não podem reordenar hipóteses.");
  await applyPriorityOrder(project.id, orderedIds);
  revalidatePath("/hypotheses");
}

// Chamada quando um card é arrastado para uma coluna de status diferente.
// Mudar o status manualmente é sempre um override rastreado (mesma regra de
// overrideStatus, com justificativa obrigatória) — só que disparado pelo
// próprio gesto de arrastar em vez de um formulário. orderedIdsInTargetColumn
// já inclui o card recém-movido, na posição em que foi solto.
export async function moveHypothesisToColumn(
  hypothesisId: string,
  newStatus: string,
  reason: string,
  orderedIdsInTargetColumn: string[]
) {
  const { user, project, role } = await getPageContext();
  if (role !== "owner" && role !== "editor") throw new Error("Sem permissão para mudar o status desta hipótese.");
  if (!reason.trim()) throw new Error("Justificativa obrigatória para mover a hipótese para outra coluna.");

  const [existing] = await db.select().from(hypotheses).where(eq(hypotheses.id, hypothesisId)).limit(1);
  if (!existing || existing.projectId !== project.id) throw new Error("Hipótese não encontrada.");

  await db
    .update(hypotheses)
    .set({ status: newStatus as never, statusOverridden: true, statusOverrideReason: reason, updatedAt: new Date() })
    .where(eq(hypotheses.id, hypothesisId));

  await db.insert(hypothesisHistory).values({
    hypothesisId,
    fieldChanged: "status",
    oldValue: existing.status,
    newValue: newStatus,
    note: reason,
    isOverride: true,
    changedBy: user.id,
  });

  await applyPriorityOrder(project.id, orderedIdsInTargetColumn);

  revalidatePath("/hypotheses");
  revalidatePath(`/hypotheses/${hypothesisId}`);
}
