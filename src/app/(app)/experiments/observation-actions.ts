"use server";

import { db } from "@/db";
import { experiments, fieldObservations } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { parseTranscript, speakerLabel } from "@/lib/transcript-parser";
import { observationFromForm } from "@/lib/field-observation-input";
import { createInterviewAudioUpload } from "../research/interviews/actions";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

// O envio do arquivo usa a mesma autorização das entrevistas (URL assinada
// direto para o Storage, bucket privado): ver createInterviewAudioUpload.
export async function createObservationAudioUpload(fileName: string, contentType: string) {
  return createInterviewAudioUpload(fileName, contentType);
}

async function loadExperiment(experimentId: string, projectId: string) {
  const [exp] = await db.select().from(experiments).where(eq(experiments.id, experimentId)).limit(1);
  if (!exp || exp.projectId !== projectId) throw new Error("Experimento não encontrado.");
  if (exp.method !== "field_observation") throw new Error("Este experimento não é do tipo observação em campo.");
  return exp;
}

export async function createFieldObservation(experimentId: string, formData: FormData) {
  const { user, project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  const exp = await loadExperiment(experimentId, project.id);

  const input = observationFromForm(formData, project.id);
  if (!input.title) throw new Error("Dê um título ao registro (ex.: Gerente do call center — Ângela).");
  if (!input.transcript && !input.notes && !input.audioPath) {
    throw new Error("Preencha as anotações ou anexe a gravação/transcrição.");
  }
  const { hasContent: _hasContent, title, ...rest } = input;

  const [created] = await db
    .insert(fieldObservations)
    .values({ projectId: project.id, experimentId, title, ...rest, createdBy: user.id })
    .returning();

  revalidatePath(`/experiments/${experimentId}`);
  revalidatePath(`/hypotheses/${exp.hypothesisId}`);
  redirect(`/experiments/${experimentId}/observations/${created.id}`);
}

export async function updateFieldObservation(observationId: string, formData: FormData) {
  const { project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  const [obs] = await db.select().from(fieldObservations).where(eq(fieldObservations.id, observationId)).limit(1);
  if (!obs || obs.projectId !== project.id) throw new Error("Registro não encontrado.");

  const input = observationFromForm(formData, project.id);
  if (!input.title) throw new Error("O título é obrigatório.");
  const { hasContent: _hasContent, title, audioPath, ...rest } = input;

  await db
    .update(fieldObservations)
    .set({ title, ...rest, ...(audioPath ? { audioPath } : {}) })
    .where(eq(fieldObservations.id, observationId));

  revalidatePath(`/experiments/${obs.experimentId}`, "layout");
}

// Renomeia um participante da transcrição (ex.: "Speaker 1" → "Ângela").
export async function renameObservationSpeaker(observationId: string, formData: FormData) {
  const { project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  const from = String(formData.get("from") || "");
  const to = String(formData.get("to") || "").trim();
  if (!to) return;

  const [obs] = await db.select().from(fieldObservations).where(eq(fieldObservations.id, observationId)).limit(1);
  if (!obs || obs.projectId !== project.id) throw new Error("Registro não encontrado.");

  const segments = obs.transcriptSegments ?? parseTranscript(obs.transcript);
  const renamed = segments.map((seg) => (speakerLabel(seg.speaker) === from ? { ...seg, speaker: to } : seg));
  await db.update(fieldObservations).set({ transcriptSegments: renamed }).where(eq(fieldObservations.id, observationId));
  revalidatePath(`/experiments/${obs.experimentId}`, "layout");
}

export async function deleteFieldObservation(observationId: string) {
  const { project, role } = await getPageContext();
  if (role !== "owner" && role !== "editor") throw new Error("Sem permissão para excluir registros.");
  const [obs] = await db
    .select()
    .from(fieldObservations)
    .where(and(eq(fieldObservations.id, observationId), eq(fieldObservations.projectId, project.id)))
    .limit(1);
  if (!obs) throw new Error("Registro não encontrado.");
  await db.delete(fieldObservations).where(eq(fieldObservations.id, observationId));
  revalidatePath(`/experiments/${obs.experimentId}`, "layout");
  redirect(`/experiments/${obs.experimentId}`);
}
