// Progresso dos objetivos do PRD: só conta como "feito" o objetivo que ainda
// existe na lista (se o texto foi apagado/editado, a marcação antiga é ignorada).
export function goalsProgress(goals: string[] | null | undefined, done: string[] | null | undefined) {
  const list = goals ?? [];
  const doneSet = new Set(done ?? []);
  const doneCount = list.filter((g) => doneSet.has(g)).length;
  const total = list.length;
  return { total, done: doneCount, percent: total === 0 ? 0 : Math.round((doneCount / total) * 100) };
}
