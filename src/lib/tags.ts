// Tags das oportunidades (ex.: "Fase 1", "Mensageria"). Guardadas como lista de
// textos em opportunities.tags. Entrada livre: separe por vírgula, ponto e vírgula
// ou quebra de linha.
export const MAX_TAGS = 12;
export const MAX_TAG_LENGTH = 32;

export function parseTags(raw: string | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of String(raw ?? "").split(/[,;\n]+/)) {
    const tag = part.replace(/\s+/g, " ").trim().slice(0, MAX_TAG_LENGTH).trim();
    if (!tag) continue;
    const key = tag.toLocaleLowerCase("pt-BR");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

// Tags de fase ("Fase 0", "Fase 1"...) ganham uma cor por fase; as demais ficam neutras.
const PHASE_COLORS = ["emerald", "sky", "violet", "amber", "indigo"] as const;
export function tagColor(tag: string): "slate" | "emerald" | "sky" | "violet" | "amber" | "indigo" {
  const m = /^fase\s*(\d+)/i.exec(tag.trim());
  if (!m) return "slate";
  return PHASE_COLORS[Number(m[1]) % PHASE_COLORS.length];
}

// Tags do card no Azure DevOps depois de um envio: parte das tags que já estão no
// card, tira só as que este app tinha levado antes e que foram removidas aqui, e
// acrescenta as tags atuais da oportunidade. O que foi criado direto no Azure
// (ex.: ab:manter, discovery-*) nunca é removido. Compara sem diferenciar maiúsculas.
export function mergeAzureTags(azureTags: string[], appTags: string[], previouslySynced: string[]): string[] {
  const key = (t: string) => t.trim().toLocaleLowerCase("pt-BR");
  const current = new Set(appTags.map(key));
  const dropped = new Set(previouslySynced.map(key).filter((k) => !current.has(k)));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of [...azureTags, ...appTags]) {
    const k = key(t);
    if (!k || seen.has(k) || dropped.has(k)) continue;
    seen.add(k);
    out.push(t.trim());
  }
  return out;
}
