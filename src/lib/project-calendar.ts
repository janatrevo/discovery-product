// Calendário do projeto: tipos, rótulos e contas (puras, sem banco) usadas pela página
// /calendario. Datas são sempre texto "AAAA-MM-DD" (dia no fuso de São Paulo), para não
// sofrer com fuso horário. A leitura do banco fica em project-calendar-data.ts.

export const CATEGORIES = {
  marco: { label: "Marco do projeto", chip: "bg-violet-100 text-violet-800 border-violet-200", dot: "bg-violet-500" },
  pesquisa: { label: "Pesquisa", chip: "bg-sky-100 text-sky-800 border-sky-200", dot: "bg-sky-500" },
  piloto: { label: "Piloto e clientes", chip: "bg-emerald-100 text-emerald-800 border-emerald-200", dot: "bg-emerald-500" },
  campo: { label: "Experimento em campo", chip: "bg-teal-100 text-teal-800 border-teal-200", dot: "bg-teal-500" },
  apresentacao: { label: "Apresentação", chip: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200", dot: "bg-fuchsia-500" },
  solicitacao: { label: "Pedido a terceiros", chip: "bg-amber-100 text-amber-900 border-amber-200", dot: "bg-amber-500" },
  decisao: { label: "Decisão", chip: "bg-indigo-100 text-indigo-800 border-indigo-200", dot: "bg-indigo-500" },
  entrega: { label: "Entrega", chip: "bg-rose-100 text-rose-800 border-rose-200", dot: "bg-rose-500" },
  outro: { label: "Outro", chip: "bg-slate-100 text-slate-700 border-slate-200", dot: "bg-slate-400" },
} as const;

export type CategoryKey = keyof typeof CATEGORIES;
export const CATEGORY_KEYS = Object.keys(CATEGORIES) as CategoryKey[];

export function isCategory(v: string): v is CategoryKey {
  return (CATEGORY_KEYS as string[]).includes(v);
}

// Exemplos que aparecem como sugestão no formulário (o que ela citou ao pedir a área).
export const TITLE_SUGGESTIONS = [
  "Início do projeto",
  "Perguntas da pesquisa quantitativa respondidas",
  "Primeiras perguntas qualitativas",
  "Laboratório aceitou fazer parte do piloto",
  "Experimento em campo",
  "Apresentação do primeiro roadmap à diretoria",
  "Apresentação do roadmap com ajustes",
  "Pedido de informação ao time da ZDI",
  "Pergunta técnica ao Animati",
];

export type CalEvent = {
  key: string;
  source: "manual" | "auto";
  id?: string; // só nos manuais
  category: CategoryKey;
  title: string;
  notes?: string | null;
  counterparty?: string | null;
  start: string; // quando aconteceu / começou / pedido feito
  end: string | null; // quando terminou / foi respondido
  planned: string | null; // data prevista (base do estimado x real)
  href?: string; // link para o item de origem (eventos automáticos)
  origin?: string; // rótulo curto da origem automática (ex.: "Oportunidade")
  opportunityId?: string | null;
  open?: boolean; // item automático ainda não concluído (ex.: oportunidade com prazo no Gantt e sem entrega)
};

// ---------- datas ----------
const TZ = "America/Sao_Paulo";

/** Dia (AAAA-MM-DD) de um instante, no fuso de São Paulo. */
export function dayOf(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function todayStr(now: Date = new Date()): string {
  return dayOf(now)!;
}

function toUtc(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Dias entre duas datas (b - a). Positivo quando b é depois de a. */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

export function addDays(day: string, n: number): string {
  const d = new Date(toUtc(day) + n * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export function fmtDay(day: string | null | undefined): string {
  if (!day) return "—";
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}

export function fmtDays(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const r = Math.round(n * 10) / 10;
  return `${r.toLocaleString("pt-BR")} ${Math.abs(r) === 1 ? "dia" : "dias"}`;
}

export function isValidDay(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(toUtc(v));
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export function monthOf(day: string): string {
  return day.slice(0, 7);
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const s = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/** Semanas (domingo a sábado) que cobrem o mês, cada dia com a marca de "é do mês". */
export function monthWeeks(month: string): { day: string; inMonth: boolean }[][] {
  const [y, m] = month.split("-").map(Number);
  const first = `${month}-01`;
  const dow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0 = domingo
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const total = Math.ceil((dow + last) / 7) * 7;
  const weeks: { day: string; inMonth: boolean }[][] = [];
  for (let i = 0; i < total; i++) {
    const day = addDays(first, i - dow);
    if (i % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push({ day, inMonth: monthOf(day) === month });
  }
  return weeks;
}

// ---------- contas de prazo ----------
/** Data em que o item de fato terminou. Pedido sem resposta fica em aberto; data futura ainda não aconteceu. */
export function realDate(e: CalEvent, today: string): string | null {
  if (e.open) return null;
  if (e.end) return e.end <= today ? e.end : null;
  if (e.category === "solicitacao" && e.source === "manual") return null; // sem resposta ainda
  return e.start <= today ? e.start : null;
}

export type PlanRow = {
  event: CalEvent;
  planned: string;
  real: string | null;
  /** Dias de diferença: positivo = depois do previsto (atraso); negativo = antes. Em aberto, conta até hoje. */
  deviation: number | null;
  status: "no_prazo" | "adiantado" | "atrasado" | "aberto_no_prazo" | "aberto_atrasado";
};

export function planRows(events: CalEvent[], today: string): PlanRow[] {
  const rows: PlanRow[] = [];
  for (const e of events) {
    if (!e.planned) continue;
    const real = realDate(e, today);
    let deviation: number | null;
    let status: PlanRow["status"];
    if (real) {
      deviation = daysBetween(e.planned, real);
      status = deviation > 0 ? "atrasado" : deviation < 0 ? "adiantado" : "no_prazo";
    } else if (today > e.planned) {
      deviation = daysBetween(e.planned, today);
      status = "aberto_atrasado";
    } else {
      deviation = null;
      status = "aberto_no_prazo";
    }
    rows.push({ event: e, planned: e.planned, real, deviation, status });
  }
  return rows.sort((a, b) => (a.planned < b.planned ? 1 : a.planned > b.planned ? -1 : 0));
}

export function planSummary(rows: PlanRow[]) {
  const closed = rows.filter((r) => r.real);
  const onTime = closed.filter((r) => (r.deviation ?? 0) <= 0).length;
  const late = closed.filter((r) => (r.deviation ?? 0) > 0);
  const overdueOpen = rows.filter((r) => r.status === "aberto_atrasado").length;
  const avgDeviation = closed.length ? closed.reduce((s, r) => s + (r.deviation ?? 0), 0) / closed.length : null;
  return {
    total: rows.length,
    closed: closed.length,
    open: rows.length - closed.length,
    onTime,
    onTimePct: closed.length ? Math.round((onTime / closed.length) * 100) : null,
    lateCount: late.length,
    avgDeviation, // média de dias de desvio (negativo = costuma entregar antes)
    avgLateDays: late.length ? late.reduce((s, r) => s + (r.deviation ?? 0), 0) / late.length : null,
    overdueOpen,
  };
}

export type ResponseRow = {
  who: string;
  total: number;
  answered: number;
  pending: number;
  avgDays: number | null;
  maxDays: number | null;
  oldestPendingDays: number | null;
};

/** Tempo de resposta por contraparte (ZDI, Animati...), só dos pedidos a terceiros. */
export function responseStats(events: CalEvent[], today: string): ResponseRow[] {
  const by = new Map<string, CalEvent[]>();
  for (const e of events) {
    if (e.category !== "solicitacao") continue;
    const who = e.counterparty?.trim() || "Sem contraparte";
    by.set(who, [...(by.get(who) ?? []), e]);
  }
  const rows: ResponseRow[] = [];
  for (const [who, list] of by) {
    const answered = list.filter((e) => e.end && e.end <= today);
    const pending = list.filter((e) => !e.end || e.end > today);
    const durs = answered.map((e) => Math.max(0, daysBetween(e.start, e.end!)));
    const ages = pending.filter((e) => e.start <= today).map((e) => daysBetween(e.start, today));
    rows.push({
      who,
      total: list.length,
      answered: answered.length,
      pending: pending.length,
      avgDays: durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : null,
      maxDays: durs.length ? Math.max(...durs) : null,
      oldestPendingDays: ages.length ? Math.max(...ages) : null,
    });
  }
  return rows.sort((a, b) => b.total - a.total || a.who.localeCompare(b.who, "pt-BR"));
}

export function sortEvents(events: CalEvent[]): CalEvent[] {
  return [...events].sort((a, b) => (a.start < b.start ? 1 : a.start > b.start ? -1 : a.title.localeCompare(b.title, "pt-BR")));
}

/** Eventos de cada dia do mês: começo, fim (resposta/entrega) e data prevista ainda sem resultado. */
export type DayMark = { event: CalEvent; kind: "start" | "end" | "planned" };
export function marksByDay(events: CalEvent[], today: string): Map<string, DayMark[]> {
  const map = new Map<string, DayMark[]>();
  const push = (day: string, m: DayMark) => map.set(day, [...(map.get(day) ?? []), m]);
  for (const e of events) {
    push(e.start, { event: e, kind: "start" });
    if (e.end && e.end !== e.start) push(e.end, { event: e, kind: "end" });
    if (e.planned && !realDate(e, today) && e.planned !== e.start) push(e.planned, { event: e, kind: "planned" });
  }
  return map;
}
