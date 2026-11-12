import Link from "next/link";
import { db } from "@/db";
import { opportunities } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { loadAutoEvents, loadManualEvents } from "@/lib/project-calendar-data";
import {
  CATEGORIES,
  CATEGORY_KEYS,
  addDays,
  daysBetween,
  fmtDay,
  fmtDays,
  isCategory,
  marksByDay,
  monthLabel,
  monthOf,
  monthWeeks,
  planRows,
  planSummary,
  realDate,
  responseStats,
  shiftMonth,
  sortEvents,
  todayStr,
  type CalEvent,
  type CategoryKey,
  type PlanRow,
} from "@/lib/project-calendar";
import { createProjectEvent, deleteProjectEvent, markEventAnswered, updateProjectEvent } from "./actions";
import { EventForm } from "./event-form";

type SP = { mes?: string; cat?: string; origem?: string; novo?: string; erro?: string; ok?: string };

const STATUS_LABEL: Record<PlanRow["status"], { text: string; color: "emerald" | "sky" | "red" | "amber" | "slate" }> = {
  no_prazo: { text: "No prazo", color: "emerald" },
  adiantado: { text: "Adiantado", color: "sky" },
  atrasado: { text: "Entregue com atraso", color: "red" },
  aberto_no_prazo: { text: "Em aberto, no prazo", color: "slate" },
  aberto_atrasado: { text: "Em aberto, atrasado", color: "amber" },
};

function qs(base: SP, patch: Partial<SP>) {
  const m = { ...base, ...patch, erro: undefined, ok: undefined, novo: undefined } as Record<string, string | undefined>;
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(m)) if (v) p.set(k, v);
  const s = p.toString();
  return `/calendario${s ? `?${s}` : ""}`;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="!p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
    </Card>
  );
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { project, role } = await getPageContext();
  const canWrite = role !== "viewer";
  const today = todayStr();

  const month = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : monthOf(today);
  const catFilter: CategoryKey | "" = sp.cat && isCategory(sp.cat) ? sp.cat : "";
  const originFilter = sp.origem === "manual" || sp.origem === "auto" ? sp.origem : "";

  const [manual, auto, oppList] = await Promise.all([
    loadManualEvents(project.id),
    loadAutoEvents(project.id),
    db.select({ id: opportunities.id, title: opportunities.title }).from(opportunities).where(eq(opportunities.projectId, project.id)).orderBy(asc(opportunities.title)),
  ]);

  const all = sortEvents([...manual, ...auto]);
  const visible = all.filter((e) => (!catFilter || e.category === catFilter) && (!originFilter || e.source === originFilter));
  const counterparties = [...new Set(manual.map((e) => e.counterparty?.trim()).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, "pt-BR"));

  // ---- Relatórios (sempre sobre tudo, sem filtros) ----
  const plan = planRows(all, today);
  const sum = planSummary(plan);
  const resp = responseStats(all, today);
  const pending = manual.filter((e) => e.category === "solicitacao" && (!e.end || e.end > today));
  const answeredAll = resp.reduce((s, r) => s + r.answered, 0);
  const respAvgAll = answeredAll
    ? resp.reduce((s, r) => s + (r.avgDays ?? 0) * r.answered, 0) / answeredAll
    : null;
  const firstDay = all.length ? all[all.length - 1].start : null;
  const daysRunning = firstDay ? daysBetween(firstDay, today) : null;

  // ---- Calendário do mês ----
  const weeks = monthWeeks(month);
  const marks = marksByDay(visible, today);

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Calendário do projeto"
        description="Tudo o que acontece no Trevo One em um só lugar: o que você registra aqui e o que o app já sabe (oportunidades, user stories, pesquisas, entrevistas, campo e decisões). Os relatórios abaixo se atualizam sozinhos."
        actions={
          canWrite ? (
            <Link href="/calendario?novo=1">
              <Button>+ Novo registro</Button>
            </Link>
          ) : undefined
        }
      />

      {sp.erro && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{sp.erro}</div>}
      {sp.ok && <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Salvo.</div>}

      {canWrite && (
        <details open={!!sp.novo || !!sp.erro} className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm">
          <summary className="cursor-pointer select-none px-5 py-3 text-sm font-medium text-slate-800">Registrar um acontecimento</summary>
          <div className="border-t border-slate-100 p-5">
            <EventForm action={createProjectEvent} counterparties={counterparties} opportunities={oppList} submitLabel="Salvar registro" idPrefix="novo" />
          </div>
        </details>
      )}

      {/* KPIs */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Dias de projeto" value={daysRunning === null ? "—" : String(daysRunning)} hint={firstDay ? `desde ${fmtDay(firstDay)}` : "registre o início do projeto"} />
        <Stat label="Registros" value={String(all.length)} hint={`${manual.length} manuais · ${auto.length} automáticos`} />
        <Stat label="Entregas no prazo" value={sum.onTimePct === null ? "—" : `${sum.onTimePct}%`} hint={sum.closed ? `${sum.onTime} de ${sum.closed} com prazo` : "sem prazos concluídos ainda"} />
        <Stat label="Desvio médio do prazo" value={sum.avgDeviation === null ? "—" : fmtDays(sum.avgDeviation)} hint="positivo = atraso; negativo = antes" />
        <Stat label="Resposta de terceiros" value={respAvgAll === null ? "—" : fmtDays(respAvgAll)} hint={pending.length ? `${pending.length} aguardando resposta` : "tempo médio até responder"} />
      </div>

      {/* Aguardando resposta */}
      {pending.length > 0 && (
        <Card className="mb-6 border-amber-200 bg-amber-50/50">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Aguardando resposta</h2>
          <ul className="space-y-2">
            {pending
              .slice()
              .sort((a, b) => (a.start < b.start ? -1 : 1))
              .map((e) => (
                <li key={e.key} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>
                    <strong className="font-medium text-slate-900">{e.counterparty || "Sem contraparte"}</strong>
                    <span className="text-slate-600"> · {e.title}</span>
                    <span className="text-slate-400"> · pedido em {fmtDay(e.start)}</span>
                    {e.start <= today && <Badge color="amber">{fmtDays(daysBetween(e.start, today))} de espera</Badge>}
                  </span>
                  {canWrite && e.id && (
                    <form action={markEventAnswered.bind(null, e.id)} className="flex items-center gap-2">
                      <input type="date" name="finishedOn" defaultValue={today} className="rounded-md border border-slate-300 px-2 py-1 text-xs" />
                      <Button type="submit" size="sm" variant="secondary">
                        Foi respondido
                      </Button>
                    </form>
                  )}
                </li>
              ))}
          </ul>
        </Card>
      )}

      {/* Filtros */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium text-slate-500">Tipo:</span>
        <Link href={qs(sp, { cat: undefined })} className={`rounded-full border px-2.5 py-1 ${!catFilter ? "border-indigo-300 bg-indigo-50 text-indigo-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
          Todos
        </Link>
        {CATEGORY_KEYS.map((k) => (
          <Link key={k} href={qs(sp, { cat: k })} className={`rounded-full border px-2.5 py-1 ${catFilter === k ? "border-indigo-300 bg-indigo-50 text-indigo-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {CATEGORIES[k].label}
          </Link>
        ))}
        <span className="ml-3 font-medium text-slate-500">Origem:</span>
        {[
          ["", "Todas"],
          ["manual", "Registradas por mim"],
          ["auto", "Automáticas"],
        ].map(([v, l]) => (
          <Link key={v} href={qs(sp, { origem: v || undefined })} className={`rounded-full border px-2.5 py-1 ${originFilter === v ? "border-indigo-300 bg-indigo-50 text-indigo-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {l}
          </Link>
        ))}
      </div>

      {/* Calendário */}
      <Card className="mb-6 !p-0 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">{monthLabel(month)}</h2>
          <div className="flex items-center gap-2 text-xs">
            <Link href={qs(sp, { mes: shiftMonth(month, -1) })} className="rounded-md border border-slate-200 px-2.5 py-1 hover:bg-slate-50">
              ← Anterior
            </Link>
            <Link href={qs(sp, { mes: undefined })} className="rounded-md border border-slate-200 px-2.5 py-1 hover:bg-slate-50">
              Hoje
            </Link>
            <Link href={qs(sp, { mes: shiftMonth(month, 1) })} className="rounded-md border border-slate-200 px-2.5 py-1 hover:bg-slate-50">
              Próximo →
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-center text-[11px] font-medium text-slate-500">
          {["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].map((d) => (
            <div key={d} className="py-1.5">
              {d}
            </div>
          ))}
        </div>
        {weeks.map((w, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-slate-100 last:border-b-0">
            {w.map(({ day, inMonth }) => {
              const list = marks.get(day) ?? [];
              return (
                <div key={day} className={`min-h-24 border-r border-slate-100 p-1 last:border-r-0 ${inMonth ? "bg-white" : "bg-slate-50/60"}`}>
                  <div className={`mb-0.5 text-right text-[11px] ${day === today ? "font-bold text-indigo-600" : inMonth ? "text-slate-500" : "text-slate-300"}`}>{Number(day.slice(8))}</div>
                  <div className="space-y-0.5">
                    {list.slice(0, 3).map((m, i) => {
                      const c = CATEGORIES[m.event.category];
                      const prefix = m.kind === "end" ? "✓ " : m.kind === "planned" ? "prev. " : "";
                      const cls = `block truncate rounded border px-1 py-0.5 text-[10px] leading-tight ${c.chip} ${m.kind === "planned" ? "border-dashed bg-white" : ""} ${m.event.source === "auto" ? "opacity-80" : "font-medium"}`;
                      const label = `${prefix}${m.event.title}`;
                      const tip = `${label}${m.event.counterparty ? ` — ${m.event.counterparty}` : ""}`;
                      return m.event.href ? (
                        <Link key={i} href={m.event.href} title={tip} className={cls}>
                          {label}
                        </Link>
                      ) : (
                        <a key={i} href={`#ev-${m.event.id}`} title={tip} className={cls}>
                          {label}
                        </a>
                      );
                    })}
                    {list.length > 3 && <p className="px-1 text-[10px] text-slate-400">+{list.length - 3} mais</p>}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <div className="flex flex-wrap gap-3 border-t border-slate-100 px-4 py-2 text-[11px] text-slate-500">
          {CATEGORY_KEYS.map((k) => (
            <span key={k} className="inline-flex items-center gap-1">
              <span className={`h-2 w-2 rounded-full ${CATEGORIES[k].dot}`} />
              {CATEGORIES[k].label}
            </span>
          ))}
          <span>· ✓ = término ou resposta · “prev.” = data prevista ainda sem resultado · cor mais clara = automático</span>
        </div>
      </Card>

      {/* Estimado x real */}
      <section className="mb-6">
        <h2 className="mb-1 text-base font-semibold text-slate-900">Prazo estimado x real</h2>
        <p className="mb-3 text-xs text-slate-500">
          Entram aqui os registros com “data prevista” e as oportunidades com prazo no Gantt (Azure DevOps → Roadmap). Ao marcar a oportunidade como
          concluída, a data real entra sozinha.
        </p>
        {plan.length === 0 ? (
          <EmptyState title="Ainda não há prazos para comparar" description="Preencha a “data prevista” ao registrar algo, ou defina o prazo das oportunidades no Gantt." />
        ) : (
          <Card className="!p-0 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Item</th>
                  <th className="px-3 py-2 font-medium">Previsto</th>
                  <th className="px-3 py-2 font-medium">Real</th>
                  <th className="px-3 py-2 font-medium">Desvio</th>
                  <th className="px-3 py-2 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {plan.slice(0, 40).map((r) => (
                  <tr key={r.event.key} className="border-b border-slate-50 last:border-b-0">
                    <td className="px-4 py-2">
                      {r.event.href ? (
                        <Link href={r.event.href} className="text-indigo-700 hover:underline">
                          {r.event.title}
                        </Link>
                      ) : (
                        <span className="text-slate-800">{r.event.title}</span>
                      )}
                      <span className="ml-2 text-xs text-slate-400">{CATEGORIES[r.event.category].label}</span>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{fmtDay(r.planned)}</td>
                    <td className="px-3 py-2 text-slate-600">{fmtDay(r.real)}</td>
                    <td className="px-3 py-2 text-slate-600">{r.deviation === null ? "—" : `${r.deviation > 0 ? "+" : ""}${r.deviation} d`}</td>
                    <td className="px-3 py-2">
                      <Badge color={STATUS_LABEL[r.status].color}>{STATUS_LABEL[r.status].text}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
              {sum.total} item(ns) com prazo · {sum.closed} concluído(s) · {sum.open} em aberto ({sum.overdueOpen} já passou da data prevista)
              {sum.avgLateDays !== null && ` · quando atrasa, atrasa em média ${fmtDays(sum.avgLateDays)}`}
            </p>
          </Card>
        )}
      </section>

      {/* Tempo de resposta */}
      <section className="mb-6">
        <h2 className="mb-1 text-base font-semibold text-slate-900">Tempo de resposta de terceiros</h2>
        <p className="mb-3 text-xs text-slate-500">
          Vem dos registros do tipo “Pedido a terceiros”: a data do pedido até a data da resposta, por contraparte (ZDI, Animati…).
        </p>
        {resp.length === 0 ? (
          <EmptyState title="Nenhum pedido registrado" description="Registre o pedido com a data e, quando chegar a resposta, clique em “Foi respondido”." />
        ) : (
          <Card className="!p-0 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Quem</th>
                  <th className="px-3 py-2 font-medium">Pedidos</th>
                  <th className="px-3 py-2 font-medium">Respondidos</th>
                  <th className="px-3 py-2 font-medium">Média</th>
                  <th className="px-3 py-2 font-medium">Maior espera</th>
                  <th className="px-3 py-2 font-medium">Aguardando</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const maxAvg = Math.max(1, ...resp.map((r) => r.avgDays ?? 0));
                  return resp.map((r) => (
                    <tr key={r.who} className="border-b border-slate-50 last:border-b-0">
                      <td className="px-4 py-2 font-medium text-slate-800">{r.who}</td>
                      <td className="px-3 py-2 text-slate-600">{r.total}</td>
                      <td className="px-3 py-2 text-slate-600">{r.answered}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.round(((r.avgDays ?? 0) / maxAvg) * 100)}%` }} />
                          </div>
                          <span className="text-slate-700">{fmtDays(r.avgDays)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-slate-600">{fmtDays(r.maxDays)}</td>
                      <td className="px-3 py-2 text-slate-600">{r.pending ? `${r.pending}${r.oldestPendingDays !== null ? ` (a mais antiga: ${fmtDays(r.oldestPendingDays)})` : ""}` : "—"}</td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      {/* Linha do tempo */}
      <section className="mb-10">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Linha do tempo</h2>
        {visible.length === 0 ? (
          <EmptyState title="Nada por aqui ainda" description="Registre o início do projeto, as respostas das pesquisas, o aceite do piloto… ou ajuste os filtros." />
        ) : (
          <div className="space-y-2">
            {visible.slice(0, 200).map((e) => (
              <EventRow key={e.key} e={e} today={today} canWrite={canWrite} counterparties={counterparties} opportunities={oppList} />
            ))}
            {visible.length > 200 && <p className="text-xs text-slate-400">Mostrando os 200 mais recentes de {visible.length}. Use os filtros para refinar.</p>}
          </div>
        )}
      </section>
    </div>
  );
}

function EventRow({
  e,
  today,
  canWrite,
  counterparties,
  opportunities: opps,
}: {
  e: CalEvent;
  today: string;
  canWrite: boolean;
  counterparties: string[];
  opportunities: { id: string; title: string }[];
}) {
  const c = CATEGORIES[e.category];
  const real = realDate(e, today);
  const waiting = e.category === "solicitacao" && e.source === "manual" && !e.end;
  const dur = e.end ? daysBetween(e.start, e.end) : null;
  const dev = e.planned && real ? daysBetween(e.planned, real) : null;
  const head = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="w-24 shrink-0 text-xs font-medium text-slate-500">{fmtDay(e.start)}</span>
      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${c.chip}`}>{c.label}</span>
      <span className="min-w-0 flex-1 text-sm text-slate-900">{e.title}</span>
      {e.counterparty && <span className="text-xs text-slate-500">{e.counterparty}</span>}
      {dur !== null && <Badge color="sky">{e.category === "solicitacao" ? "respondido em " : "durou "}{fmtDays(dur)}</Badge>}
      {waiting && <Badge color="amber">aguardando{e.start <= today ? ` há ${fmtDays(daysBetween(e.start, today))}` : ""}</Badge>}
      {dev !== null && <Badge color={dev > 0 ? "red" : "emerald"}>{dev > 0 ? `${dev} d de atraso` : dev < 0 ? `${-dev} d antes` : "no prazo"}</Badge>}
      {e.source === "auto" && <span className="text-[11px] text-slate-400">automático · {e.origin}</span>}
    </div>
  );
  if (e.source === "auto") {
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-2.5">
        {e.href ? (
          <Link href={e.href} className="block hover:opacity-80">
            {head}
          </Link>
        ) : (
          head
        )}
        {e.notes && <p className="mt-1 pl-24 text-xs text-slate-400">{e.notes}</p>}
      </div>
    );
  }
  return (
    <details id={`ev-${e.id}`} className="rounded-lg border border-slate-200 bg-white">
      <summary className="cursor-pointer list-none px-4 py-2.5">{head}</summary>
      <div className="border-t border-slate-100 p-4">
        {e.notes && <p className="mb-3 whitespace-pre-wrap text-sm text-slate-600">{e.notes}</p>}
        {canWrite && e.id && (
          <>
            <EventForm action={updateProjectEvent.bind(null, e.id)} event={e} counterparties={counterparties} opportunities={opps} submitLabel="Salvar alterações" idPrefix={`ed-${e.id}`} />
            <form action={deleteProjectEvent.bind(null, e.id)} className="mt-3">
              <ConfirmSubmitButton message="Apagar este registro? Isso não pode ser desfeito." size="sm">
                Apagar registro
              </ConfirmSubmitButton>
            </form>
          </>
        )}
      </div>
    </details>
  );
}
