"use server";

import { db } from "@/db";
import { experiments, fieldObservationMedia, fieldObservations } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { createSignedUploadUrl, deleteFromStorage, ensureBucket, FIELD_MEDIA_BUCKET } from "@/lib/supabase-storage";
import { revalidatePath } from "next/cache";

async function loadFieldExperiment(experimentId: string, projectId: string) {
  const [exp] = await db.select().from(experiments).where(eq(experiments.id, experimentId)).limit(1);
  if (!exp || exp.projectId !== projectId) throw new Error("Experimento não encontrado.");
  if (exp.method !== "field_observation") throw new Error("Este experimento não é do tipo observação em campo.");
  return exp;
}

function mediaKind(contentType: string): "photo" | "video" | null {
  if (contentType.startsWith("image/")) return "photo";
  if (contentType.startsWith("video/")) return "video";
  return null;
}

// Passo 1 do envio: o servidor só autoriza e devolve a URL de envio assinada;
// o navegador manda a foto ou o vídeo direto para o Storage (bucket privado),
// sem passar pelo limite de corpo da Vercel.
export async function createFieldMediaUpload(experimentId: string, fileName: string, contentType: string) {
  const { project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  await loadFieldExperiment(experimentId, project.id);
  if (!mediaKind(contentType)) {
    throw new Error("Envie uma foto (jpg, png, webp...) ou um vídeo (mp4, mov, webm...).");
  }
  const safeName = fileName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(-80);
  const path = `field-media/${project.id}/${experimentId}/${crypto.randomUUID()}-${safeName}`;
  await ensureBucket(FIELD_MEDIA_BUCKET);
  const signedUrl = await createSignedUploadUrl(FIELD_MEDIA_BUCKET, path);
  return { signedUrl, path };
}

type RegisterInput = {
  path: string;
  fileName: string;
  contentType: string;
  systemName?: string;
  caption?: string;
  observationId?: string;
};

// Passo 2: depois que o arquivo chegou ao Storage, registra a foto/vídeo no banco.
export async function registerFieldMedia(experimentId: string, input: RegisterInput) {
  const { user, project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  const exp = await loadFieldExperiment(experimentId, project.id);

  const kind = mediaKind(input.contentType);
  if (!kind) throw new Error("Tipo de arquivo não aceito.");
  const prefix = `field-media/${project.id}/${experimentId}/`;
  if (!input.path.startsWith(prefix) || input.path.includes("..")) throw new Error("Caminho de arquivo inválido.");

  let observationId: string | null = null;
  if (input.observationId) {
    const [obs] = await db
      .select({ id: fieldObservations.id })
      .from(fieldObservations)
      .where(and(eq(fieldObservations.id, input.observationId), eq(fieldObservations.experimentId, experimentId)))
      .limit(1);
    if (!obs) throw new Error("Registro de observação não encontrado neste experimento.");
    observationId = obs.id;
  }

  await db.insert(fieldObservationMedia).values({
    projectId: project.id,
    experimentId,
    observationId,
    kind,
    filePath: input.path,
    fileName: input.fileName.slice(0, 255),
    contentType: input.contentType.slice(0, 100),
    systemName: input.systemName?.trim().slice(0, 255) || null,
    caption: input.caption?.trim() || null,
    createdBy: user.id,
  });

  revalidatePath(`/experiments/${experimentId}`, "layout");
  revalidatePath(`/hypotheses/${exp.hypothesisId}`);
}

export async function updateFieldMedia(mediaId: string, formData: FormData) {
  const { project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  const [m] = await db.select().from(fieldObservationMedia).where(eq(fieldObservationMedia.id, mediaId)).limit(1);
  if (!m || m.projectId !== project.id) throw new Error("Arquivo não encontrado.");

  await db
    .update(fieldObservationMedia)
    .set({
      systemName: String(formData.get("systemName") || "").trim().slice(0, 255) || null,
      caption: String(formData.get("caption") || "").trim() || null,
    })
    .where(eq(fieldObservationMedia.id, mediaId));
  revalidatePath(`/experiments/${m.experimentId}`, "layout");
}

export async function deleteFieldMedia(mediaId: string) {
  const { project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  const [m] = await db
    .select()
    .from(fieldObservationMedia)
    .where(and(eq(fieldObservationMedia.id, mediaId), eq(fieldObservationMedia.projectId, project.id)))
    .limit(1);
  if (!m) throw new Error("Arquivo não encontrado.");

  await db.delete(fieldObservationMedia).where(eq(fieldObservationMedia.id, mediaId));
  try {
    await deleteFromStorage(FIELD_MEDIA_BUCKET, m.filePath);
  } catch {
    // arquivo órfão no Storage não deve impedir a exclusão
  }
  revalidatePath(`/experiments/${m.experimentId}`, "layout");
}
