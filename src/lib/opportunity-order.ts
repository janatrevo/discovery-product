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
