"use client";

import { useState } from "react";
import Link from "next/link";
import { groupOpportunitiesByPhase, titleWithoutPhase, PHASE_NAMES } from "@/lib/opportunity-order";

export type RoadmapItem = { id: string; title: string; status: string; score: number | null };

const STATUS_LABEL: Record<string, string> = {
  new: "Nova",
  prioritized: "Priorizada",
  in_progress: "Em progresso",
  done: "Concluída",
  archived: "Arquivada",
};

const STATUS_CLASS: Record<string, string> = {
  new: "bg-slate-100 text-slate-600",
  prioritized: "bg-indigo-100 text-indigo-800",
  in_progress: "bg-amber-100 text-amber-900",
  done: "bg-emerald-100 text-emerald-800",
  archived: "bg-slate-100 text-slate-400",
};

function fmt(n: number | null) {
  return n === null ? "—" : n.toFixed(2);
}

export function RoadmapView({ items }: { items: RoadmapItem[] }) {
  const [view, setView] = useState<"lista" | "colunas">("lista");
  const groups = groupOpportunitiesByPhase(items);
  const maxScore = Math.max(0.01, ...items.map((i) => i.score ?? 0));
  const avg = (g: RoadmapItem[]) => {
    const withScore = g.filter((x) => x.score !== null) as (RoadmapItem & { score: number })[];
    return withScore.length ? withScore.reduce((a, b) => a + b.score, 0) / withScore.length : null;
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">Roadmap · Oportunidades vinculadas</p>
          <p className="text-xs text-slate-500">
            {items.length} {items.length === 1 ? "oportunidade" : "oportunidades"} em {groups.length}{" "}
            {groups.length === 1 ? "grupo" : "grupos"}, ordenadas por fase e depois por nome
          </p>
        </div>
        <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs">
          {(
            [
              ["lista", "Lista por fase"],
              ["colunas", "Colunas por fase"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={
                view === key
                  ? "rounded-md bg-white px-2.5 py-1 font-medium text-slate-900 shadow-sm"
                  : "rounded-md px-2.5 py-1 text-slate-500 hover:text-slate-700"
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {view === "lista" ? (
        <div className="space-y-3">
          {groups.map((g) => (
            <section key={g.label} className="overflow-hidden rounded-lg border border-slate-200">
              <header className="flex flex-wrap items-center justify-between gap-1 bg-indigo-50 px-3 py-2">
                <p className="text-sm">
                  <span className="mr-2 font-semibold text-indigo-700">{g.label}</span>
                  {g.phase !== null && PHASE_NAMES[g.phase] && (
                    <span className="font-medium text-slate-700">{PHASE_NAMES[g.phase]}</span>
                  )}
                </p>
                <p className="text-xs text-slate-500">
                  {g.items.length} {g.items.length === 1 ? "oportunidade" : "oportunidades"}
                  {avg(g.items) !== null && <> · pontuação média {fmt(avg(g.items))}</>}
                </p>
              </header>
              {g.items.map((o) => (
                <Link
                  key={o.id}
                  href={`/opportunities/${o.id}`}
                  className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 border-t border-slate-100 px-3 py-2 hover:bg-slate-50 sm:grid-cols-[1fr_auto_130px]"
                >
                  <span className="min-w-0 text-sm font-medium text-slate-800">{titleWithoutPhase(o.title)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS_CLASS[o.status] ?? STATUS_CLASS.new}`}>
                    {STATUS_LABEL[o.status] ?? o.status}
                  </span>
                  <span className="col-span-2 flex items-center gap-2 sm:col-span-1 sm:justify-end">
                    <span className="h-1.5 w-16 overflow-hidden rounded bg-slate-200">
                      <span
                        className="block h-full bg-violet-500"
                        style={{ width: `${Math.round(((o.score ?? 0) / maxScore) * 100)}%` }}
                      />
                    </span>
                    <span className="w-9 text-right text-xs font-semibold tabular-nums text-slate-800">{fmt(o.score)}</span>
                  </span>
                </Link>
              ))}
            </section>
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {groups.map((g) => (
            <div key={g.label} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
              <div className="mb-2 flex flex-wrap items-baseline gap-x-2 rounded-md bg-violet-600 px-2.5 py-2 text-white">
                <span className="text-sm font-semibold">{g.label}</span>
                {g.phase !== null && PHASE_NAMES[g.phase] && (
                  <span className="text-xs text-violet-100">{PHASE_NAMES[g.phase]}</span>
                )}
                <span className="ml-auto rounded-full bg-white/20 px-2 text-xs">{g.items.length}</span>
              </div>
              {g.items.map((o) => (
                <Link
                  key={o.id}
                  href={`/opportunities/${o.id}`}
                  className="mb-1.5 flex items-start justify-between gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
                >
                  <span>{titleWithoutPhase(o.title)}</span>
                  <span className="font-semibold tabular-nums text-indigo-600">{fmt(o.score)}</span>
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 text-xs text-slate-500">
        A barra e o número são a pontuação de prioridade.{" "}
        <Link href="/opportunities" className="text-indigo-700 hover:underline">
          Abrir no Discovery Board →
        </Link>
      </p>
    </div>
  );
}
