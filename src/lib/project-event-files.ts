// Regras dos anexos do calendário (usadas no servidor e no navegador).
export const EVENT_FILE_MAX_BYTES = 50 * 1024 * 1024; // limite do Storage no plano gratuito do Supabase

export const EVENT_FILE_EXTENSIONS = [
  "pdf", "ppt", "pptx", "key", "odp",
  "doc", "docx", "odt", "txt", "md",
  "xls", "xlsx", "csv", "ods",
  "png", "jpg", "jpeg", "webp", "gif",
  "mp4", "mov", "webm", "mp3", "m4a", "wav",
  "zip",
] as const;

export const EVENT_FILE_ACCEPT = EVENT_FILE_EXTENSIONS.map((e) => `.${e}`).join(",");

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function isAllowedEventFile(name: string): boolean {
  return (EVENT_FILE_EXTENSIONS as readonly string[]).includes(extOf(name));
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return "";
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export type EventFileItem = { id: string; name: string; size: number | null; createdAt: string };
