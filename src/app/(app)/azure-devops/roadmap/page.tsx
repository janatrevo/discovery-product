import Link from "next/link";
import type { ReactNode } from "react";
import { db } from "@/db";
import { opportunities } from "@/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { listFeatures, featureStateColor, featureWebUrl, type AzureFeature } from "@/lib/azure-devops";
import { Badge, Button, Card, EmptyState, Field, Input, Label, PageHeader } from "@/components/ui/primitives";
import { updatePlannedDates } from "../../opportunities/actions";

const STATE_COLOR_HEX: Record<"slate" | "sky" | "emerald" | "amber", string> = {
  slate: "#94a3b8", // slate-400
  sky: "#38bdf8", // sky-400
  emerald: "#34d399", // emerald-400
  amber: "#fbbf24", // amber-400
};

const AB_TAG_LABELS: Record<string, string> = {
  testing: "Em teste A/B",
  keep: "Manter",
  remove: "Remover",
};
const AB_TAG_COLORS: Record<string, "amber" | "emerald" | "red"> = { testing: "amber", keep: "emerald", remove: "red" };

function fmtDate(d: Date) {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function toDateInputValue(d: Date | string | null | undefined) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}

// Primeiro dia de cada mês entre `start` e `end` (inclusive), usado para
// desenhar as linhas de grade verticais do Gantt.
function monthTicks(start: Date, end: Date) {
  const ticks: Date[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= end) {
    ticks.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return ticks;
}

export default async function RoadmapPage() {
  const { project, role } = await getPageContext();
  const isOwner = role === "owner";

  const rows = await db
    .select()
    .from(opportunities)
    .where(and(eq(opportunities.projectId, project.id), isNotNull(opportunities.azureFeatureId)));

  let featureMap = new Map<number, AzureFeature>();
  let loadError: string | null = null;
  try {
    const features = await listFeatures();
    featureMap = new Map(features.map((f) => [f.id, f]));
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Não foi possível carregar os estados do Azure DevOps.";
  }

  const scheduled = rows.filter((r) => r.plannedStartDate && r.plannedEndDate);
  const unscheduled = rows.filter((r) => !r.plannedStartDate || !r.plannedEndDate);

  let ganttBody: ReactNode = null;
  if (scheduled.length > 0) {
    const starts = scheduled.map((r) => new Date(r.plannedStartDate!).getTime());
    const ends = scheduled.map((r) => new Date(r.plannedEndDate!).getTime());
    const rangeStart = new Date(Math.min(...starts));
    const rangeEnd = new Date(Math.max(...ends));
    // Um pouco de respiro nas bordas pra barra do primeiro/último item não
    // colar exatamente na borda do gráfico.
    rangeStart.setDate(rangeStart.getDate() - 3);
    rangeEnd.setDate(rangeEnd.getDate() + 3);
    const totalMs = Math.max(rangeEnd.getTime() - rangeStart.getTime(), 1);
    const pct = (d: Date) => ((d.getTime() - rangeStart.getTime()) / totalMs) * 100;
    const ticks = monthTicks(rangeStart, rangeEnd);

    ganttBody = (
      <div className="overflow-x-auto">
        <div className="relative min-w-[720px]" style={{ paddingTop: 28 }}>
          {/* Linhas de grade mensais — recessivas, só orientação, nunca competem com as barras. */}
          {ticks.map((t, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 border-l border-slate-200"
              style={{ left: `${pct(t)}%` }}
            >
              <span className="absolute -top-6 -translate-x-1/2 whitespace-nowrap text-[11px] text-slate-400">
                {t.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" })}
              </span>
            </div>
          ))}

          <div className="space-y-3 pb-2">
            {scheduled.map((r) => {
              const feature = r.azureFeatureId ? featureMap.get(r.azureFeatureId) : undefined;
              const color = STATE_COLOR_HEX[featureStateColor(feature?.state || "")];
              const start = new Date(r.plannedStartDate!);
              const end = new Date(r.plannedEndDate!);
              const left = pct(start);
              const width = Math.max(pct(end) - left, 2);
              return (
                <div key={r.id} className="relative h-8">
                  <div className="absolute inset-y-0 left-0 flex w-40 shrink-0 items-center pr-2 text-xs text-slate-600">
                    <span className="truncate">{r.title}</span>
                  </div>
                  <div className="relative ml-40 h-full">
                    <div
                      className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full"
                      style={{ left: `${left}%`, width: `${width}%`, backgroundColor: color }}
                      title={`${r.title}\n${fmtDate(start)} — ${fmtDate(end)}${feature ? `\nEstado: ${feature.state}` : ""}`}
                    />
                    <span
                      className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-[11px] text-slate-500"
                      style={{ left: `calc(${left + width}% + 8px)` }}
                    >
                      {fmtDate(start)} – {fmtDate(end)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Roadmap — Gráfico Gantt"
        description="Timeline de entregas das Features enviadas ao Azure DevOps, a partir das datas planejadas no discovery-app."
        actions={
          <Link href="/azure-devops">
            <Button variant="secondary">← Voltar</Button>
          </Link>
        }
      />

      {loadError && (
        <Card className="mb-4 border-amber-300 bg-amber-50">
          <p className="text-sm text-amber-800">
            Não consegui atualizar os estados a partir do Azure DevOps agora ({loadError}) — as barras abaixo
            usam só as datas planejadas, sem cor de status.
          </p>
        </Card>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title="Nenhuma oportunidade enviada ao Azure DevOps ainda"
          description='Gere um PRD numa oportunidade e use "Enviar como Feature ao Azure DevOps" para que ela apareça aqui.'
        />
      ) : (
        <>
          <Card className="mb-4">
            <div className="mb-3 flex items-center gap-4 text-xs text-slate-500">
              <span className="font-medium text-slate-700">Legenda:</span>
              {(["amber", "sky", "emerald", "slate"] as const).map((c) => (
                <span key={c} className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATE_COLOR_HEX[c] }} />
                  {c === "amber" && "Novo"}
                  {c === "sky" && "Em andamento"}
                  {c === "emerald" && "Concluído"}
                  {c === "slate" && "Outro estado"}
                </span>
              ))}
            </div>
            {scheduled.length === 0 ? (
              <p className="text-sm text-slate-400">
                Nenhuma Feature com data de início e entrega definidas ainda — defina as datas na tabela
                abaixo pra elas aparecerem no gráfico.
              </p>
            ) : (
              ganttBody
            )}
          </Card>

          <Card>
            <p className="mb-3 text-sm font-semibold text-slate-700">Todas as Features enviadas ({rows.length})</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-2 pr-3">Título</th>
                    <th className="py-2 pr-3">Estado</th>
                    <th className="py-2 pr-3">Decisão A/B</th>
                    {isOwner ? (
                      <th className="py-2 pr-3" colSpan={3}>
                        Timeline planejada
                      </th>
                    ) : (
                      <th className="py-2 pr-3">Timeline planejada</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {[...scheduled, ...unscheduled].map((r) => {
                    const feature = r.azureFeatureId ? featureMap.get(r.azureFeatureId) : undefined;
                    return (
                      <tr key={r.id} className="border-b border-slate-100">
                        <td className="py-2 pr-3">
                          <a
                            href={featureWebUrl(r.azureFeatureId!)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-indigo-600 hover:underline"
                          >
                            {r.title}
                          </a>
                        </td>
                        <td className="py-2 pr-3">
                          {feature ? (
                            <Badge color={featureStateColor(feature.state)}>{feature.state}</Badge>
                          ) : (
                            <Badge color="slate">desconhecido</Badge>
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          <Badge color={AB_TAG_COLORS[r.abTestDecision]}>{AB_TAG_LABELS[r.abTestDecision]}</Badge>
                        </td>
                        {isOwner ? (
                          <td className="py-2 pr-3" colSpan={3}>
                            <form
                              action={updatePlannedDates.bind(null, r.id)}
                              className="flex flex-wrap items-end gap-2"
                            >
                              <Field>
                                <Label>Início</Label>
                                <Input type="date" name="plannedStartDate" defaultValue={toDateInputValue(r.plannedStartDate)} />
                              </Field>
                              <Field>
                                <Label>Entrega</Label>
                                <Input type="date" name="plannedEndDate" defaultValue={toDateInputValue(r.plannedEndDate)} />
                              </Field>
                              <Button type="submit" size="sm" variant="secondary">
                                Salvar
                              </Button>
                            </form>
                          </td>
                        ) : (
                          <td className="py-2 pr-3 text-slate-500">
                            {r.plannedStartDate && r.plannedEndDate
                              ? `${fmtDate(new Date(r.plannedStartDate))} – ${fmtDate(new Date(r.plannedEndDate))}`
                              : "Sem datas"}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
