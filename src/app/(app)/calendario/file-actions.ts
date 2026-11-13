"use server";

import { db } from "@/db";
import { projectEventFiles, projectEvents } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getPageContext } from "@/lib/page-context";
import { createSignedUploadUrl, deleteFromStorage, ensureBucket, PROJECT_FILES_BUCKET } from "@/lib/supabase-storage";
import { EVENT_FILE_MAX_BYTES, isAllowedEventFile } from "@/lib/project-event-files";

async function loadEditableEvent(eventId: string) {
  const { user, project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  const [ev] = await db
    .select()
    .from(projectEvents)
    .where(and(eq(projectEvents.id, eventId), eq(projectEvents.projectId, project.id)))
    .limit(1);
  if (!ev) throw new Error("Registro não encontrado.");
  if (role === "contributor" && ev.createdBy !== user.id) throw new Error("Você só pode anexar arquivos aos registros que criou.");
  return { user, project, ev };
}

// Passo 1: o servidor só autoriza e devolve a URL de envio assinada; o navegador
// manda o arquivo direto ao Storage (bucket privado), sem o limite de corpo da Vercel.
export async function createEventFileUpload(eventId: string, fileName: string, size: number) {
  const { project } = await loadEditableEvent(eventId);
  if (!isAllowedEventFile(fileName)) {
    throw new Error("Tipo de arquivo não aceito. Envie PDF, PowerPoint, Word, Excel, imagem, áudio, vídeo ou ZIP.");
  }
  if (size > EVENT_FILE_MAX_BYTES) throw new Error("Arquivo maior que 50 MB (limite do Storage). Comprima ou divida o arquivo.");
  const safeName = fileName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(-100);
  const path = `calendar/${project.id}/${eventId}/${crypto.randomUUID()}-${safeName}`;
  await ensureBucket(PROJECT_FILES_BUCKET);
  const signedUrl = await createSignedUploadUrl(PROJECT_FILES_BUCKET, path);
  return { signedUrl, path };
}

// Passo 2: depois que o arquivo chegou ao Storage, registra no banco.
export async function registerEventFile(eventId: string, input: { path: string; fileName: string; contentType: string; size: number }) {
  const { user, project } = await loadEditableEvent(eventId);
  const prefix = `calendar/${project.id}/${eventId}/`;
  if (!input.path.startsWith(prefix) || input.path.includes("..")) throw new Error("Caminho de arquivo inválido.");
  if (!isAllowedEventFile(input.fileName)) throw new Error("Tipo de arquivo não aceito.");
  await db.insert(projectEventFiles).values({
    projectId: project.id,
    eventId,
    filePath: input.path,
    fileName: input.fileName.slice(0, 255),
    contentType: input.contentType.slice(0, 150) || null,
    sizeBytes: Number.isFinite(input.size) ? Math.round(input.size) : null,
    createdBy: user.id,
  });
  revalidatePath("/calendario");
}

export async function deleteEventFile(fileId: string) {
  const { project, role, user } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  const [f] = await db
    .select()
    .from(projectEventFiles)
    .where(and(eq(projectEventFiles.id, fileId), eq(projectEventFiles.projectId, project.id)))
    .limit(1);
  if (!f) throw new Error("Arquivo não encontrado.");
  if (role === "contributor" && f.createdBy !== user.id) throw new Error("Você só pode apagar os arquivos que enviou.");
  await db.delete(projectEventFiles).where(eq(projectEventFiles.id, fileId));
  try {
    await deleteFromStorage(PROJECT_FILES_BUCKET, f.filePath);
  } catch {
    // arquivo órfão no Storage não deve impedir a exclusão
  }
  revalidatePath("/calendario");
}
