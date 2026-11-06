import { parseTranscript } from "@/lib/transcript-parser";

function text(formData: FormData, key: string): string | null {
  return String(formData.get(key) || "").trim() || null;
}

function parseDate(value: FormDataEntryValue | null): Date {
  const raw = String(value || "").trim();
  if (!raw) return new Date();
  const d = new Date(`${raw}T12:00:00`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export function validObservationAudioPath(value: FormDataEntryValue | null, projectId: string): string | null {
  const path = String(value || "").trim();
  return path.startsWith(`interviews/${projectId}/`) && !path.includes("..") ? path : null;
}

// Lê do formulário os campos de um registro de observação em campo. Usado ao
// criar/editar um registro e também na criação do experimento (primeiro registro).
export function observationFromForm(formData: FormData, projectId: string) {
  const personName = text(formData, "personName");
  const personRole = text(formData, "personRole");
  const site = text(formData, "site");
  const area = text(formData, "area");
  const systemsUsed = text(formData, "systemsUsed");
  const notes = text(formData, "notes");
  const transcript = String(formData.get("transcript") || "");
  const segments = parseTranscript(transcript);
  const audioPath = validObservationAudioPath(formData.get("audioPath"), projectId);
  const typedTitle = text(formData, "title");
  const autoTitle = [personName, personRole, site].filter(Boolean).join(" — ");

  return {
    title: typedTitle ?? (autoTitle || null),
    site,
    area,
    personName,
    personRole,
    observedAt: parseDate(formData.get("observedAt")),
    systemsUsed,
    notes,
    transcript: transcript.trim() ? transcript : null,
    transcriptSegments: segments.length ? segments : null,
    audioPath,
    // Algum dado de verdade além da data (que sempre vem preenchida)?
    hasContent: !!(typedTitle || personName || personRole || site || area || systemsUsed || notes || transcript.trim() || audioPath),
  };
}
