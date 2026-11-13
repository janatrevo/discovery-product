"use server";

import { db } from "@/db";
import { projectEventFiles, projectEvents } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPageContext } from "@/lib/page-context";
import { deleteFromStorage, PROJECT_FILES_BUCKET } from "@/lib/supabase-storage";
import { isCategory, isValidDay, todayStr } from "@/lib/project-calendar";

type Parsed = {
  category: string;
  title: string;
  notes: string | null;
  counterparty: string | null;
  occurredOn: string;
  finishedOn: string | null;
  plannedOn: string | null;
  opportunityId: string | null;
};

function parse(formData: FormData): Parsed {
  const text = (k: string) => String(formData.get(k) ?? "").trim();
  const day = (k: string, label: string, required: boolean) => {
    const v = text(k);
    if (!v) {
      if (required) throw new Error(`Informe ${label}.`);
      return null;
    }
    if (!isValidDay(v)) throw new Error(`Data inválida em "${label}".`);
    return v;
  };
  const category = text("category");
  if (!isCategory(category)) throw new Error("Escolha o tipo do registro.");
  const title = text("title");
  if (!title) throw new Error("Escreva o que aconteceu.");
  const occurredOn = day("occurredOn", "a data em que aconteceu", true)!;
  const finishedOn = day("finishedOn", "a data de término ou resposta", false);
  const plannedOn = day("plannedOn", "a data prevista", false);
  if (finishedOn && finishedOn < occurredOn) throw new Error("A data de término/resposta não pode ser antes da data em que aconteceu.");
  return {
    category,
    title: title.slice(0, 255),
    notes: text("notes") || null,
    counterparty: text("counterparty").slice(0, 120) || null,
    occurredOn,
    finishedOn,
    plannedOn,
    opportunityId: text("opportunityId") || null,
  };
}

function back(error?: string, extra?: Record<string, string>): never {
  const p = new URLSearchParams(extra);
  if (error) p.set("erro", error.slice(0, 400));
  const q = p.toString();
  const anchor = extra?.anexar ? `#ev-${extra.anexar}` : "";
  redirect(`/calendario${q ? `?${q}` : ""}${anchor}`);
}

export async function createProjectEvent(formData: FormData) {
  const { user, project, role } = await getPageContext();
  let error: string | null = null;
  let newId: string | null = null;
  try {
    if (role === "viewer") throw new Error("Viewers não podem registrar eventos.");
    const v = parse(formData);
    const [row] = await db.insert(projectEvents).values({ projectId: project.id, createdBy: user.id, ...v }).returning({ id: projectEvents.id });
    newId = row.id;
  } catch (e) {
    error = e instanceof Error ? e.message : "Não foi possível salvar.";
  }
  revalidatePath("/calendario");
  if (error) back(error, { novo: "1" });
  // Abre o registro recém-criado já com a área de anexos à mostra.
  back(undefined, newId ? { ok: "1", anexar: newId } : { ok: "1" });
}

export async function updateProjectEvent(id: string, formData: FormData) {
  const { user, project, role } = await getPageContext();
  let error: string | null = null;
  try {
    if (role === "viewer") throw new Error("Viewers não podem editar eventos.");
    const v = parse(formData);
    const [row] = await db.select().from(projectEvents).where(and(eq(projectEvents.id, id), eq(projectEvents.projectId, project.id))).limit(1);
    if (!row) throw new Error("Registro não encontrado.");
    if (role === "contributor" && row.createdBy !== user.id) throw new Error("Você só pode editar os registros que criou.");
    await db.update(projectEvents).set(v).where(eq(projectEvents.id, id));
  } catch (e) {
    error = e instanceof Error ? e.message : "Não foi possível salvar.";
  }
  revalidatePath("/calendario");
  if (error) back(error);
  back(undefined, { ok: "1" });
}

/** Atalho: pedido respondido hoje (ou na data informada no formulário rápido). */
export async function markEventAnswered(id: string, formData: FormData) {
  const { user, project, role } = await getPageContext();
  let error: string | null = null;
  try {
    if (role === "viewer") throw new Error("Viewers não podem editar eventos.");
    const raw = String(formData.get("finishedOn") ?? "").trim() || todayStr();
    if (!isValidDay(raw)) throw new Error("Data inválida.");
    const [row] = await db.select().from(projectEvents).where(and(eq(projectEvents.id, id), eq(projectEvents.projectId, project.id))).limit(1);
    if (!row) throw new Error("Registro não encontrado.");
    if (role === "contributor" && row.createdBy !== user.id) throw new Error("Você só pode editar os registros que criou.");
    if (raw < row.occurredOn) throw new Error("A resposta não pode ser antes do pedido.");
    await db.update(projectEvents).set({ finishedOn: raw }).where(eq(projectEvents.id, id));
  } catch (e) {
    error = e instanceof Error ? e.message : "Não foi possível salvar.";
  }
  revalidatePath("/calendario");
  if (error) back(error);
  back(undefined, { ok: "1" });
}

export async function deleteProjectEvent(id: string) {
  const { user, project, role } = await getPageContext();
  let error: string | null = null;
  try {
    if (role === "viewer") throw new Error("Viewers não podem apagar eventos.");
    const [row] = await db.select().from(projectEvents).where(and(eq(projectEvents.id, id), eq(projectEvents.projectId, project.id))).limit(1);
    if (!row) throw new Error("Registro não encontrado.");
    if (role === "contributor" && row.createdBy !== user.id) throw new Error("Você só pode apagar os registros que criou.");
    const files = await db.select({ filePath: projectEventFiles.filePath }).from(projectEventFiles).where(eq(projectEventFiles.eventId, id));
    await db.delete(projectEvents).where(eq(projectEvents.id, id)); // os metadados dos anexos saem em cascata
    for (const f of files) {
      try {
        await deleteFromStorage(PROJECT_FILES_BUCKET, f.filePath);
      } catch {
        // arquivo órfão no Storage não deve impedir a exclusão
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : "Não foi possível apagar.";
  }
  revalidatePath("/calendario");
  if (error) back(error);
  back(undefined, { ok: "1" });
}
