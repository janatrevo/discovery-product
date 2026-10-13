// Converte a transcrição colada (texto livre) em segmentos estruturados
// { speaker, start (segundos), text } — é o que alimenta a visualização
// estilo Fireflies (participantes, tempo de fala, clique no trecho = pular no
// áudio). Aceita os formatos mais comuns de exportação:
//
//   [00:12] Maria: texto             00:12 Maria: texto
//   Maria (00:12): texto             Maria [00:12]: texto
//   Maria  00:12   (cabeçalho, texto nas linhas seguintes — Fireflies/Zoom/Meet)
//   00:12 Maria    (idem)
//   Maria: texto                     (sem horário — só quem falou)
//   Arquivos .srt / .vtt colados     (horário vem da linha "00:00:01 --> 00:00:05")
//   Texto corrido sem marcação       (cada parágrafo vira um trecho)

export type TranscriptSegment = { speaker: string; start: number | null; text: string };

const TIME = String.raw`(?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?`;

const RE_CUE = new RegExp(String.raw`^(${TIME})\s*-->\s*(${TIME})`);
const RE_TIME_FIRST = new RegExp(String.raw`^[\[(]?(${TIME})[\])]?\s*[-–—]?\s*([^:\[\](){}]{1,60}?)\s*:\s*(.*)$`);
const RE_SPEAKER_FIRST = new RegExp(String.raw`^([^:\[\](){}]{1,60}?)\s*[\[(]\s*(${TIME})\s*[\])]\s*[:\-–—]?\s*(.*)$`);
const RE_HEADER_NAME_TIME = new RegExp(String.raw`^([^\d:\[\](){}.,;!?][^:\[\](){}.,;!?]{0,38}?)\s+(${TIME})$`);
const RE_HEADER_TIME_NAME = new RegExp(String.raw`^[\[(]?(${TIME})[\])]?\s+([^\d:\[\](){}.,;!?][^:\[\](){}.,;!?]{0,38})$`);
const RE_SPEAKER_ONLY = /^([A-Za-zÀ-ÿ][^:\[\](){}]{0,39}?):\s+(.+)$/;
const RE_VOICE_TAG = /^<v(?:\.[^\s>]+)?\s+([^>]+)>(.*?)(?:<\/v>)?$/;

export function parseTimestamp(s: string): number {
  const parts = s.replace(",", ".").split(":").map(Number);
  let seconds = 0;
  for (const p of parts) seconds = seconds * 60 + p;
  return seconds;
}

export function formatTimestamp(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function speakerLabel(speaker: string): string {
  return speaker.trim() || "Participante";
}

function cleanSpeaker(s: string): string {
  return s.replace(/^[\s\-–—*]+/, "").replace(/[\s*]+$/, "").trim();
}

export function parseTranscript(raw: string | null | undefined): TranscriptSegment[] {
  if (!raw || !raw.trim()) return [];
  const lines = raw.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim());

  const segments: (TranscriptSegment & { fromCue?: boolean })[] = [];
  let cur: (TranscriptSegment & { fromCue?: boolean }) | null = null;
  let inCue = false;

  const flush = () => {
    if (cur && cur.text.trim()) segments.push({ ...cur, text: cur.text.trim() });
    cur = null;
  };
  const startSegment = (speaker: string, start: number | null, text: string, fromCue = false) => {
    flush();
    cur = { speaker: cleanSpeaker(speaker), start, text, fromCue };
  };
  const append = (text: string) => {
    if (!cur) cur = { speaker: "", start: null, text: "" };
    cur.text += (cur.text ? " " : "") + text;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!line) {
      inCue = false;
      // Texto corrido sem marcação: cada parágrafo vira um trecho.
      const c = cur as TranscriptSegment | null;
      if (c && c.speaker === "" && c.start === null) flush();
      continue;
    }
    if (/^WEBVTT\b/i.test(line) || /^NOTE\b/.test(line)) continue;

    // Índice numérico de cue do .srt (só se a próxima linha for um horário).
    if (/^\d+$/.test(line) && RE_CUE.test(lines[i + 1] ?? "")) continue;

    const cue = line.match(RE_CUE);
    if (cue) {
      startSegment("", parseTimestamp(cue[1]), "", true);
      inCue = true;
      continue;
    }

    if (inCue) {
      const c = cur as TranscriptSegment | null;
      const voice = line.match(RE_VOICE_TAG);
      if (voice && c && !c.text) {
        c.speaker = cleanSpeaker(voice[1]);
        append(voice[2]);
        continue;
      }
      const named = line.match(RE_SPEAKER_ONLY);
      if (named && c && !c.text && !c.speaker) {
        c.speaker = cleanSpeaker(named[1]);
        append(named[2]);
        continue;
      }
      append(line.replace(/<[^>]+>/g, ""));
      continue;
    }

    let m = line.match(RE_TIME_FIRST);
    if (m) {
      startSegment(m[2], parseTimestamp(m[1]), m[3]);
      continue;
    }
    m = line.match(RE_SPEAKER_FIRST);
    if (m) {
      startSegment(m[1], parseTimestamp(m[2]), m[3]);
      continue;
    }
    m = line.match(RE_HEADER_NAME_TIME);
    if (m) {
      startSegment(m[1], parseTimestamp(m[2]), "");
      continue;
    }
    m = line.match(RE_HEADER_TIME_NAME);
    if (m) {
      startSegment(m[2], parseTimestamp(m[1]), "");
      continue;
    }
    m = line.match(RE_SPEAKER_ONLY);
    if (m) {
      startSegment(m[1], null, m[2]);
      continue;
    }

    append(line);
  }
  flush();

  // Junta cues consecutivos da mesma pessoa (legendas .srt/.vtt costumam vir
  // picadas em frases curtas).
  const merged: TranscriptSegment[] = [];
  let prev: (TranscriptSegment & { fromCue?: boolean }) | null = null;
  for (const seg of segments) {
    if (prev && seg.fromCue && prev.fromCue && prev.speaker === seg.speaker && prev.text.length + seg.text.length < 500) {
      prev.text += " " + seg.text;
      continue;
    }
    prev = { ...seg };
    merged.push(prev);
  }
  return merged.map(({ speaker, start, text }) => ({ speaker, start, text }));
}

// Quem fala quanto: usa os horários (início do trecho até o início do próximo)
// quando existem; senão, número de palavras.
export function computeSpeakerStats(segments: TranscriptSegment[], totalDuration?: number | null) {
  const withTime = segments.filter((s) => s.start !== null).length;
  const useTime = segments.length > 0 && withTime >= segments.length * 0.5;

  const weight = segments.map((s, i) => {
    if (!useTime) return s.text.split(/\s+/).filter(Boolean).length;
    const next = segments.slice(i + 1).find((n) => n.start !== null);
    const end = next?.start ?? (totalDuration && s.start !== null && totalDuration > s.start ? totalDuration : null);
    if (s.start === null || end === null) return s.text.split(/\s+/).filter(Boolean).length / 2.5; // ~2,5 palavras/s
    return Math.min(Math.max(end - s.start, 0), 180);
  });

  const order: string[] = [];
  const totals = new Map<string, number>();
  segments.forEach((s, i) => {
    const key = speakerLabel(s.speaker);
    if (!totals.has(key)) {
      order.push(key);
      totals.set(key, 0);
    }
    totals.set(key, (totals.get(key) ?? 0) + weight[i]);
  });
  const sum = [...totals.values()].reduce((a, b) => a + b, 0) || 1;
  return {
    usesTime: useTime,
    speakers: order.map((name) => ({
      name,
      seconds: totals.get(name) ?? 0,
      percent: Math.round(((totals.get(name) ?? 0) / sum) * 100),
    })),
  };
}
