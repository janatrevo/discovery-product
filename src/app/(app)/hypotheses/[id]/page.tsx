import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { db } from "@/db";
import {
  hypotheses,
  hypothesisPersonas,
  hypothesisProducts,
  hypothesisHistory,
  personas,
  products,
  experiments,
  opportunities,
  surveys,
  interviewGuides,
  usabilityTests,
  usabilityFindings,
  simulationRuns,
  decisions,
} from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { Badge, Button, Card, PageHeader } from "@/components/ui/primitives";
import { STATUS_LABELS, STATUS_COLORS, HYPOTHESIS_TYPES } from "@/lib/hypothesis-types";
import { deleteHypothesis, overrideStatus, clearOverride } from "../actions";
import { deleteExperiment } from "../../experiments/actions";
import { unlinkHypothesisFromOpportunity } from "../../opportunities/actions";
import { unlinkHypothesisFromSurvey } from "../../research/surveys/actions";
import { unlinkHypothesisFromGuide } from "../../research/interviews/actions";
import { unlinkHypothesisFromTest, unlinkHypothesisFromFinding } from "../../usability/actions";
import { unlinkHypothesisFromSimulation } from "../../simulations/actions";
import { EvidenceTab } from "@/components/hypothesis-tabs/evidence-tab";
import { ConfidenceReceiptCard } from "@/components/hypothesis-tabs/confidence-receipt";
import { ExperimentsMiniList } from "@/components/hypothesis-tabs/experiments-mini";
import { SimulationsMiniList } from "@/components/hypothesis-tabs/simulations-mini";
import { ResearchMiniList } from "@/components/hypothesis-tabs/research-mini";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "evidence", label: "Evidence" },
  { key: "research", label: "Research" },
  { key: "experiments", label: "Experiments" },
  { key: "simulations", label: "Simulations" },
  { key: "history", label: "History" },
];

export default async function HypothesisWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab = "overview" } = await searchParams;
  const { project, role } = await getPageContext();

  const [hyp] = await db.select().from(hypotheses).where(eq(hypotheses.id, id)).limit(1);
  if (!hyp || hyp.projectId !== project.id) notFound();

  const canDelete = role === "owner" || role === "editor";

  // Espelha exatamente o que checkHypothesisDeletable (src/lib/delete-guards.ts)
  // verifica antes de excluir — mesma lógica já aplicada em Persona e
  // Produto: mostra cada vínculo com um jeito de resolver, em vez de deixar
  // a exclusão estourar um "Runtime Error" cru. Decisões são a única exceção
  // sem botão de ação: por design, uma hipótese citada num Decision Log
  // nunca pode ser desvinculada — é histórico imutável (ver comentário em
  // checkHypothesisDeletable).
  const [
    linkedPersonas,
    linkedProducts,
    blockingExperiments,
    blockingOpportunities,
    blockingSurveys,
    blockingGuides,
    blockingTests,
    blockingFindings,
    blockingSimulations,
    blockingDecisions,
  ] = await Promise.all([
    db
      .select({ persona: personas })
      .from(hypothesisPersonas)
      .innerJoin(personas, eq(personas.id, hypothesisPersonas.personaId))
      .where(eq(hypothesisPersonas.hypothesisId, id)),
    db
      .select({ product: products })
      .from(hypothesisProducts)
      .innerJoin(products, eq(products.id, hypothesisProducts.productId))
      .where(eq(hypothesisProducts.hypothesisId, id)),
    canDelete ? db.select().from(experiments).where(eq(experiments.hypothesisId, id)) : Promise.resolve([]),
    canDelete ? db.select().from(opportunities).where(eq(opportunities.hypothesisId, id)) : Promise.resolve([]),
    canDelete ? db.select().from(surveys).where(eq(surveys.hypothesisId, id)) : Promise.resolve([]),
    canDelete ? db.select().from(interviewGuides).where(eq(interviewGuides.hypothesisId, id)) : Promise.resolve([]),
    canDelete ? db.select().from(usabilityTests).where(eq(usabilityTests.hypothesisId, id)) : Promise.resolve([]),
    canDelete ? db.select().from(usabilityFindings).where(eq(usabilityFindings.hypothesisId, id)) : Promise.resolve([]),
    canDelete ? db.select().from(simulationRuns).where(eq(simulationRuns.hypothesisId, id)) : Promise.resolve([]),
    canDelete
      ? db.select().from(decisions).where(sql`${decisions.hypothesisRefs} @> ${JSON.stringify([id])}::jsonb`)
      : Promise.resolve([]),
  ]);

  // "Hipótese relacionada" é um link de verdade pra outra hipótese do
  // projeto (ver src/db/schema.ts) — busca o título pra exibir clicável em
  // vez de só guardar o id.
  const relatedHyp = hyp.relatedHypothesisId
    ? await db.select().from(hypotheses).where(eq(hypotheses.id, hyp.relatedHypothesisId)).limit(1).then((r) => r[0])
    : null;

  const hasBlockers =
    canDelete &&
    (blockingExperiments.length > 0 ||
      blockingOpportunities.length > 0 ||
      blockingSurveys.length > 0 ||
      blockingGuides.length > 0 ||
      blockingTests.length > 0 ||
      blockingFindings.length > 0 ||
      blockingSimulations.length > 0 ||
      blockingDecisions.length > 0);
  const canDeleteNow = canDelete && !hasBlockers;

  const typeInfo = HYPOTHESIS_TYPES.find((t) => t.value === hyp.type);

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={hyp.title}
        description={typeInfo ? `${typeInfo.label} — ${typeInfo.hint}` : hyp.type}
        actions={
          <>
            <Badge color={STATUS_COLORS[hyp.status]}>{STATUS_LABELS[hyp.status]}</Badge>
            <Link href={`/opportunities/new?hypothesisId=${id}`}>
              <Button variant="secondary">+ Oportunidade</Button>
            </Link>
            <Link href={`/hypotheses/${id}/edit`}>
              <Button variant="secondary">Editar</Button>
            </Link>
            {canDeleteNow && (
              <form action={deleteHypothesis.bind(null, id)}>
                <Button variant="danger" type="submit">
                  Excluir
                </Button>
              </form>
            )}
          </>
        }
      />

      {linkedProducts.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Produto:</span>
          {linkedProducts.map((p) => (
            <Link key={p.product.id} href={`/products/${p.product.id}`}>
              <Badge color="indigo">{p.product.name}</Badge>
            </Link>
          ))}
        </div>
      )}

      {hasBlockers && (
        <Card className="mb-4 border-amber-300 bg-amber-50">
          <p className="text-sm font-medium text-amber-900">Esta hipótese não pode ser excluída ainda</p>
          <p className="mt-1 text-sm text-amber-800">
            Desvincule (ou exclua, no caso de experimentos) as referências abaixo para liberar a exclusão.
          </p>

          {blockingExperiments.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase text-amber-700">
                Experimentos ({blockingExperiments.length})
              </p>
              <div className="mt-1 space-y-2">
                {blockingExperiments.map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-white px-3 py-2">
                    <Link href={`/experiments/${e.id}`} className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-800">{e.objective || "Experimento sem objetivo definido"}</p>
                    </Link>
                    <form action={deleteExperiment.bind(null, e.id, `/hypotheses/${id}`)}>
                      <Button type="submit" variant="ghost" size="sm">
                        excluir experimento
                      </Button>
                    </form>
                  </div>
                ))}
              </div>
              <p className="mt-1 text-xs text-amber-700">
                Experimentos exigem uma hipótese — não dá pra desvincular, só excluir o experimento inteiro.
              </p>
            </div>
          )}

          {blockingOpportunities.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase text-amber-700">
                Oportunidades ({blockingOpportunities.length})
              </p>
              <div className="mt-1 space-y-2">
                {blockingOpportunities.map((o) => (
                  <div key={o.id} className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-white px-3 py-2">
                    <Link href={`/opportunities/${o.id}`} className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-800">{o.title}</p>
                    </Link>
                    <form action={unlinkHypothesisFromOpportunity.bind(null, o.id, id)}>
                      <Button type="submit" variant="ghost" size="sm">
                        desvincular
                      </Button>
                    </form>
                  </div>
                ))}
              </div>
            </div>
          )}

          {blockingSurveys.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase text-amber-700">
                Surveys ({blockingSurveys.length})
              </p>
              <div className="mt-1 space-y-2">
                {blockingSurveys.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-white px-3 py-2">
                    <Link href={`/research/surveys/${s.id}`} className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-800">{s.title}</p>
                    </Link>
                    <form action={unlinkHypothesisFromSurvey.bind(null, s.id, id)}>
                      <Button type="submit" variant="ghost" size="sm">
                        desvincular
                      </Button>
                    </form>
                  </div>
                ))}
              </div>
            </div>
          )}

          {blockingGuides.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase text-amber-700">
                Roteiros de entrevista ({blockingGuides.length})
              </p>
              <div className="mt-1 space-y-2">
                {blockingGuides.map((g) => (
                  <div key={g.id} className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-white px-3 py-2">
                    <Link href={`/research/interviews/${g.id}`} className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-800">{g.title}</p>
                    </Link>
                    <form action={unlinkHypothesisFromGuide.bind(null, g.id, id)}>
                      <Button type="submit" variant="ghost" size="sm">
                        desvincular
                      </Button>
                    </form>
                  </div>
                ))}
              </div>
            </div>
          )}

          {blockingTests.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase text-amber-700">
                Testes de usabilidade ({blockingTests.length})
              </p>
              <div className="mt-1 space-y-2">
                {blockingTests.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-white px-3 py-2">
                    <Link href={`/usability/${t.id}`} className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-800">{t.title}</p>
                    </Link>
                    <form action={unlinkHypothesisFromTest.bind(null, t.id, id)}>
                      <Button type="submit" variant="ghost" size="sm">
                        desvincular
                      </Button>
                    </form>
                  </div>
                ))}
              </div>
            </div>
          )}

          {blockingFindings.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase text-amber-700">
                Achados de usabilidade ({blockingFindings.length})
              </p>
              <div className="mt-1 space-y-2">
                {blockingFindings.map((f) => (
                  <div key={f.id} className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-white px-3 py-2">
                    <Link href={`/usability/${f.usabilityTestId}`} className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-800">{f.problem}</p>
                    </Link>
                    <form action={unlinkHypothesisFromFinding.bind(null, f.id, id)}>
                      <Button type="submit" variant="ghost" size="sm">
                        desvincular
                      </Button>
                    </form>
                  </div>
                ))}
              </div>
            </div>
          )}

          {blockingSimulations.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase text-amber-700">
                Simulações ({blockingSimulations.length})
              </p>
              <div className="mt-1 space-y-2">
                {blockingSimulations.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-white px-3 py-2">
                    <Link href={`/simulations/${s.id}`} className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-800">{s.scenario || "Cenário sem título"}</p>
                    </Link>
                    <form action={unlinkHypothesisFromSimulation.bind(null, s.id, id)}>
                      <Button type="submit" variant="ghost" size="sm">
                        desvincular
                      </Button>
                    </form>
                  </div>
                ))}
              </div>
            </div>
          )}

          {blockingDecisions.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase text-amber-700">
                Decisões que citam esta hipótese ({blockingDecisions.length})
              </p>
              <div className="mt-1 space-y-2">
                {blockingDecisions.map((d) => (
                  <Link
                    key={d.id}
                    href={`/decisions/${d.id}`}
                    className="block rounded-md border border-amber-200 bg-white px-3 py-2"
                  >
                    <p className="truncate text-sm text-slate-800">{d.decisionText}</p>
                  </Link>
                ))}
              </div>
              <p className="mt-1 text-xs text-amber-700">
                Decisões já registradas nunca podem ser desvinculadas — é histórico imutável do Decision Log.
                Enquanto essas decisões existirem, esta hipótese não pode ser excluída.
              </p>
            </div>
          )}
        </Card>
      )}

      <div className="mb-5 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/hypotheses/${id}?tab=${t.key}`}
            className={clsx(
              "px-3 py-2 text-sm font-medium",
              tab === t.key
                ? "border-b-2 border-indigo-600 text-indigo-700"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-4">
          {hyp.description && (
            <Card>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Descrição</p>
              <p className="mt-1 text-sm text-slate-700">{hyp.description}</p>
            </Card>
          )}

          <ConfidenceReceiptCard hypothesis={hyp} />

          {(hyp.problemRef || hyp.solutionRef || relatedHyp) && (
            <Card className="space-y-2">
              {hyp.problemRef && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Problema relacionado</p>
                  <p className="text-sm text-slate-700">{hyp.problemRef}</p>
                </div>
              )}
              {hyp.solutionRef && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Solução relacionada</p>
                  <p className="text-sm text-slate-700">{hyp.solutionRef}</p>
                </div>
              )}
              {relatedHyp && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Hipótese relacionada</p>
                  <Link href={`/hypotheses/${relatedHyp.id}`} className="text-sm text-indigo-700 hover:underline">
                    {relatedHyp.title}
                  </Link>
                </div>
              )}
            </Card>
          )}

          <Card>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Personas & Produtos</p>
            <div className="flex flex-wrap gap-2">
              {linkedPersonas.map((p) => (
                <Link key={p.persona.id} href={`/personas/${p.persona.id}`}>
                  <Badge color={p.persona.origin === "research_based" ? "emerald" : "amber"}>
                    {p.persona.name}
                    {p.persona.jobTitle ? ` — ${p.persona.jobTitle}` : ""}
                  </Badge>
                </Link>
              ))}
              {linkedProducts.map((p) => (
                <Link key={p.product.id} href={`/products/${p.product.id}`}>
                  <Badge color="indigo">{p.product.name}</Badge>
                </Link>
              ))}
              {linkedPersonas.length === 0 && linkedProducts.length === 0 && (
                <span className="text-sm text-slate-400">Nenhuma persona ou produto vinculado.</span>
              )}
            </div>
          </Card>

          {(role === "owner" || role === "editor") && (
            <Card>
              <p className="mb-2 text-sm font-semibold text-slate-700">Forçar transição de status (override manual)</p>
              <p className="mb-3 text-xs text-slate-500">
                Use apenas quando uma decisão de negócio precisa ignorar a metodologia. Isso fica
                marcado e visível no relatório e no histórico.
              </p>
              <form action={overrideStatus.bind(null, id)} className="flex flex-wrap items-end gap-2">
                <select name="status" defaultValue={hyp.status} className="rounded-md border border-slate-300 px-2 py-2 text-sm">
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <input
                  name="reason"
                  required
                  placeholder="Justificativa (obrigatória)"
                  className="min-w-[220px] flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                <Button type="submit" variant="secondary">
                  Forçar
                </Button>
              </form>
              {hyp.statusOverridden && (
                <div className="mt-3 rounded-md bg-amber-50 p-3 text-xs text-amber-800">
                  <strong>Status atual é override manual:</strong> {hyp.statusOverrideReason}
                  <form action={clearOverride.bind(null, id)} className="mt-2">
                    <Button type="submit" size="sm" variant="ghost">
                      Voltar a calcular automaticamente
                    </Button>
                  </form>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {tab === "evidence" && <EvidenceTab hypothesisId={id} projectId={project.id} role={role} />}

      {tab === "research" && <ResearchMiniList hypothesisId={id} projectId={project.id} />}

      {tab === "experiments" && <ExperimentsMiniList hypothesisId={id} projectId={project.id} />}

      {tab === "simulations" && <SimulationsMiniList hypothesisId={id} projectId={project.id} />}

      {tab === "history" && <HistoryTab hypothesisId={id} />}
    </div>
  );
}

async function HistoryTab({ hypothesisId }: { hypothesisId: string }) {
  const history = await db
    .select()
    .from(hypothesisHistory)
    .where(eq(hypothesisHistory.hypothesisId, hypothesisId))
    .orderBy(desc(hypothesisHistory.changedAt));

  return (
    <Card>
      <p className="mb-3 text-sm font-semibold text-slate-700">
        Histórico (append-only — nunca editado, só acrescentado)
      </p>
      {history.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhum evento registrado ainda.</p>
      ) : (
        <ul className="space-y-2">
          {history.map((h) => (
            <li key={h.id} className="border-b border-slate-100 pb-2 text-sm last:border-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-700">{h.fieldChanged}</span>
                {h.isOverride && <Badge color="amber">override manual</Badge>}
                <span className="text-xs text-slate-400">
                  {new Date(h.changedAt).toLocaleString("pt-BR")}
                </span>
              </div>
              {(h.oldValue || h.newValue) && (
                <p className="mt-0.5 text-xs text-slate-500">
                  {h.oldValue && <span className="line-through">{h.oldValue}</span>} → {h.newValue}
                </p>
              )}
              {h.note && <p className="mt-0.5 text-xs text-slate-500">{h.note}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
