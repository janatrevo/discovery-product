"use server";

import { db } from "@/db";
import { hypotheses, hypothesisPersonas, hypothesisProducts, hypothesisHistory } from "@/db/schema";
import { eq } from "drizzle-orm";
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

export async function deleteHypothesis(hypothesisId: string) {
  const { role } = await getPageContext();
  if (role !== "owner" && role !== "editor") throw new Error("Sem permissão para excluir.");

  const reasons = await checkHypothesisDeletable(hypothesisId);
  if (reasons.length > 0) throw new Error(deleteBlockedMessage("esta hipótese", reasons));

  await db.delete(hypotheses).where(eq(hypotheses.id, hypothesisId));
  revalidatePath("/hypotheses");
  redirect("/hypotheses");
}
