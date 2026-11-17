// Ordenação das oportunidades pelo prefixo "[Fase N]" do título (usado no
// roadmap do Trevo One): primeiro por fase, depois em ordem alfabética (pt-BR)
// pelo nome sem o prefixo. Oportunidades sem prefixo vão para o fim.
const PHASE_RE = /^\s*\[\s*Fase\s*(\d+)\s*\]\s*/i;

export function phaseOf(title: string): number | null {
  const m = title.match(PHASE_RE);
  return m ? Number(m[1]) : null;
}

export function titleWithoutPhase(title: string): string {
  return title.replace(PHASE_RE, "");
}

export function compareByPhaseThenTitle(a: { title: string }, b: { title: string }): number {
  const pa = phaseOf(a.title);
  const pb = phaseOf(b.title);
  if (pa !== pb) {
    if (pa === null) return 1;
    if (pb === null) return -1;
    return pa - pb;
  }
  return titleWithoutPhase(a.title).localeCompare(titleWithoutPhase(b.title), "pt-BR", {
    sensitivity: "base",
    numeric: true,
  });
}

// Nomes das fases do roadmap proposto do Trevo One (Fases 0 a 5, sem lacuna).
// Fases sem nome aqui aparecem só como "Fase N".
export const PHASE_NAMES: Record<number, string> = {
  0: "Fundações",
  1: "Atendimento",
  2: "Voz",
  3: "Recepção",
  4: "Relatórios",
  5: "Portais",
};

export function groupOpportunitiesByPhase<T extends { title: string }>(
  items: T[]
): { label: string; phase: number | null; items: T[] }[] {
  const sorted = [...items].sort(compareByPhaseThenTitle);
  const groups: { label: string; phase: number | null; items: T[] }[] = [];
  for (const it of sorted) {
    const p = phaseOf(it.title);
    const label = p === null ? "Sem fase" : `Fase ${p}`;
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(it);
    else groups.push({ label, phase: p, items: [it] });
  }
  return groups;
}

// Agrupamento do roadmap da hipótese: por "[Fase N]" no título (legado) ou, quando não
// há prefixo, pela tag de módulo ("Módulo 3 · Mensageria e voz") ou de fase ("Fase 2").
// Quem não tem nenhum dos dois cai em "Sem módulo", no fim.
const MODULE_TAG_RE = /^\s*m[óo]dulo\s*(\d+)\s*(?:[·\-–:]\s*(.+))?$/i;
const PHASE_TAG_RE = /^\s*fase\s*(\d+)\s*$/i;

export type RoadmapGroup<T> = { key: string; label: string; sub?: string; order: number; items: T[] };

function groupInfo(item: { title: string; tags?: string[] | null }): { key: string; label: string; sub?: string; order: number } {
  const p = phaseOf(item.title);
  if (p !== null) return { key: `fase-${p}`, label: `Fase ${p}`, sub: PHASE_NAMES[p], order: p };
  for (const tag of item.tags ?? []) {
    const m = MODULE_TAG_RE.exec(tag);
    if (m) return { key: `modulo-${Number(m[1])}`, label: `Módulo ${Number(m[1])}`, sub: m[2]?.trim(), order: Number(m[1]) };
  }
  for (const tag of item.tags ?? []) {
    const m = PHASE_TAG_RE.exec(tag);
    if (m) return { key: `fase-${Number(m[1])}`, label: `Fase ${Number(m[1])}`, sub: PHASE_NAMES[Number(m[1])], order: Number(m[1]) };
  }
  return { key: "sem", label: "Sem módulo", order: 999 };
}

export function groupOpportunitiesForRoadmap<T extends { title: string; tags?: string[] | null }>(items: T[]): RoadmapGroup<T>[] {
  const map = new Map<string, RoadmapGroup<T>>();
  for (const it of items) {
    const g = groupInfo(it);
    const existing = map.get(g.key);
    if (existing) {
      existing.items.push(it);
      if (!existing.sub && g.sub) existing.sub = g.sub;
    } else {
      map.set(g.key, { ...g, items: [it] });
    }
  }
  const groups = [...map.values()].sort((a, b) => a.order - b.order);
  for (const g of groups) {
    g.items.sort((a, b) =>
      titleWithoutPhase(a.title).localeCompare(titleWithoutPhase(b.title), "pt-BR", { sensitivity: "base", numeric: true })
    );
  }
  return groups;
}
