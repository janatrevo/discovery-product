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
import { checkHypothesisDeletable } from "@/lib/delete-guards";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { unlinkHypothesisFromOpportunity } from "../../opportunities/actions";
import { unlinkHypothesisFromFinding } from "../../usability/actions";
import { EvidenceTab } from "@/components/hypothesis-tabs/evidence-tab";
import { ConfidenceReceiptCard } from "@/components/hypothesis-tabs/confidence-receipt";
import { ExperimentsMiniList } from "@/components/hypothesis-tabs/experiments-mini";
import { SimulationsMiniList } from "@/components/hypothesis-tabs/simulations-mini";
import { ResearchMiniList } from "@/components/hypothesis-tabs/research-mini";
import { HypothesisAiAnalysisCard } from "@/components/hypothesis-tabs/ai-analysis-card";
import { surveysForHypothesis, guidesForHypothesis } from "@/lib/research-links";
import { RoadmapCard } from "@/components/hypothesis-tabs/roadmap-card";

// A análise por IA lê todas as pesquisas e pode levar quase um minuto.
export const maxDuration = 60;

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
    db.select().from(experiments).where(eq(experiments.hypothesisId, id)),
    db.select({ id: opportunities.id }).from(opportunities).where(eq(opportunities.hypothesisId, id)),
    surveysForHypothesis(id),
    guidesForHypothesis(id),
    db.select({ id: usabilityTests.id }).from(usabilityTests).where(eq(usabilityTests.hypothesisId, id)),
    db.select().from(usabilityFindings).where(eq(usabilityFindings.hypothesisId, id)),
    db.select({ id: simulationRuns.id }).from(simulationRuns).where(eq(simulationRuns.hypothesisId, id)),
    db.select().from(decisions).where(sql`${decisions.hypothesisRefs} @> ${JSON.stringify([id])}::jsonb`),
  ]);

  // "Hipótese relacionada" é um link de verdade pra outra hipótese do
  // projeto (ver src/db/schema.ts) — busca o título pra exibir clicável em
  // vez de só guardar o id.
  const relatedHyp = hyp.relatedHypothesisId
    ? await db.select().from(hypotheses).where(eq(hypotheses.id, hyp.relatedHypothesisId)).limit(1).then((r) => r[0])
    : null;

  // O que será apagado junto e o que só será desvinculado ao excluir. A única
  // coisa que BLOQUEIA é o Decision Log (ver checkHypothesisDeletable).
  const blockReasons = canDelete ? await checkHypothesisDeletable(id) : [];
  const hasBlockers = blockReasons.length > 0;
  const willDelete = [
    blockingExperiments.length > 0 && `${blockingExperiments.length} experimento(s)`,
    blockingOpportunities.length > 0 && `${blockingOpportunities.length} oportunidade(s)`,
    blockingTests.length > 0 && `${blockingTests.length} teste(s) de usabilidade`,
    blockingSimulations.length > 0 && `${blockingSimulations.length} simulação(ões)`,
  ].filter(Boolean) as string[];
  const willUnlink = [
    blockingSurveys.length > 0 && `${blockingSurveys.length} survey(s)`,
    blockingGuides.length > 0 && `${blockingGuides.length} roteiro(s) de entrevista`,
    blockingFindings.length > 0 && `${blockingFindings.length} achado(s) de usabilidade`,
  ].filter(Boolean) as string[];
  const canDeleteNow = canDelete && !hasBlockers;
  const confirmMessage =
    `Excluir esta hipótese?\n\n` +
    (willDelete.length ? `Serão APAGADOS junto: ${willDelete.join(", ")}.\n` : "") +
    (willUnlink.length ? `Serão apenas desvinculados (continuam existindo): ${willUnlink.join(", ")}.\n` : "") +
    `Personas, evidências e entrevistas continuam existindo.\n\nEssa ação não pode ser desfeita.`;

  const typeInfo = HYPOTHESIS_TYPES.find((t) => t.value === hyp.type);

  const researchCount = blockingSurveys.length + blockingGuides.length;
  const simulationCount = blockingSimulations.length + blockingTests.length;
  const tabCounts: Record<string, number> = {
    research: researchCount,
    experiments: blockingExperiments.length,
    simulations: simulationCount,
  };
  const linkChips = [
    { label: "oportunidades", n: blockingOpportunities.length, href: `/hypotheses/${id}#oportunidades` },
    { label: "experimentos", n: blockingExperiments.length, href: `/hypotheses/${id}?tab=experiments` },
    { label: "surveys e entrevistas", n: researchCount, href: `/hypotheses/${id}?tab=research` },
    { label: "simulações e testes", n: simulationCount, href: `/hypotheses/${id}?tab=simulations` },
    { label: "decisões", n: blockingDecisions.length, href: `/hypotheses/${id}#decisoes` },
  ].filter((c) => c.n > 0);
  const canManage = canDelete; // Owner/Editor: desvincular e excluir itens dentro de cada seção

  return (
    <div className="max-w-7xl">
      <PageHeader
        title={hyp.title}
        description={typeInfo ? `${typeInfo.label} — ${typeInfo.hint}` : hyp.type}
        actions={
          <>
            <Badge color={STATUS_COLORS[hyp.status]}>{STATUS_LABELS[hyp.status]}</Badge>
            <Link href={`/hypotheses/${id}?tab=research`}>
              <Button variant="secondary">Analisar com IA</Button>
            </Link>
            <Link href={`/opportunities/new?hypothesisId=${id}`}>
              <Button variant="secondary">+ Oportunidade</Button>
            </Link>
            <Link href={`/hypotheses/${id}/edit`}>
              <Button variant="secondary">Editar</Button>
            </Link>
            {canDeleteNow && (
              <form action={deleteHypothesis.bind(null, id)}>
                <ConfirmSubmitButton message={confirmMessage}>Excluir</ConfirmSubmitButton>
              </form>
            )}
          </>
        }
      />

      {(linkedProducts.length > 0 || linkChips.length > 0) && (
        <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2">
          {linkedProducts.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Produto</span>
              {linkedProducts.map((p) => (
                <Link key={p.product.id} href={`/products/${p.product.id}`}>
                  <Badge color="indigo">{p.product.name}</Badge>
                </Link>
              ))}
            </div>
          )}
          {linkChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Vinculados</span>
              {linkChips.map((c) => (
                <Link
                  key={c.label}
                  href={c.href}
                  className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs text-slate-600 hover:border-indigo-300 hover:text-indigo-700"
                >
                  <strong className="font-semibold text-slate-800">{c.n}</strong> {c.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {canDelete && hasBlockers && (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Esta hipótese não pode ser excluída: ela aparece em decisões do Decision Log, que são histórico imutável
          {blockingDecisions.length > 0 && (
            <>
              {" "}
              (<Link href={`/hypotheses/${id}#decisoes`} className="underline">ver decisões</Link>)
            </>
          )}
          .
        </p>
      )}

      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/hypotheses/${id}?tab=${t.key}`}
            className={clsx(
              "whitespace-nowrap px-3 py-2 text-sm font-medium",
              tab === t.key
                ? "border-b-2 border-indigo-600 text-indigo-700"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            {t.label}
            {tabCounts[t.key] > 0 && (
              <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                {tabCounts[t.key]}
              </span>
            )}
          </Link>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {hyp.description && (
              <Card>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Descrição</p>
                <p className="mt-1 text-sm text-slate-700">{hyp.description}</p>
              </Card>
            )}

            <div id="oportunidades" className="scroll-mt-4">
              <RoadmapCard hypothesisId={id} unlinkAction={canManage ? unlinkHypothesisFromOpportunity : undefined} />
            </div>

            {blockingFindings.length > 0 && (
              <Card>
                <p className="mb-2 text-sm font-semibold text-slate-700">
                  Achados de usabilidade vinculados ({blockingFindings.length})
                </p>
                <div className="space-y-2">
                  {blockingFindings.map((f) => (
                    <div key={f.id} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2">
                      <Link href={`/usability/${f.usabilityTestId}`} className="min-w-0 flex-1">
                        <p className="truncate text-sm text-slate-800">{f.problem}</p>
                      </Link>
                      {canManage && (
                        <form action={unlinkHypothesisFromFinding.bind(null, f.id, id)}>
                          <Button type="submit" variant="ghost" size="sm">
                            desvincular
                          </Button>
                        </form>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            <ConfidenceReceiptCard hypothesis={hyp} />

            {blockingDecisions.length > 0 && (
              <Card>
                <div id="decisoes" className="scroll-mt-4">
                  <p className="mb-2 text-sm font-semibold text-slate-700">
                    Decisões que citam esta hipótese ({blockingDecisions.length})
                  </p>
                  <div className="space-y-2">
                    {blockingDecisions.map((d) => (
                      <Link
                        key={d.id}
                        href={`/decisions/${d.id}`}
                        className="block rounded-md border border-slate-200 px-3 py-2 hover:bg-slate-50"
                      >
                        <p className="line-clamp-2 text-sm text-slate-800">{d.decisionText}</p>
                      </Link>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Histórico imutável do Decision Log: não dá para desvincular, e enquanto elas existirem a hipótese não
                    pode ser excluída.
                  </p>
                </div>
              </Card>
            )}

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
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Personas</p>
              <div className="flex flex-wrap gap-2">
                {linkedPersonas.map((p) => (
                  <Link key={p.persona.id} href={`/personas/${p.persona.id}`}>
                    <Badge color={p.persona.origin === "research_based" ? "emerald" : "amber"}>
                      {p.persona.name}
                      {p.persona.jobTitle ? ` — ${p.persona.jobTitle}` : ""}
                    </Badge>
                  </Link>
                ))}
                {linkedPersonas.length === 0 && <span className="text-sm text-slate-400">Nenhuma persona vinculada.</span>}
              </div>
            </Card>

            {(role === "owner" || role === "editor") && (
              <Card>
                <details open={hyp.statusOverridden}>
                  <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                    Forçar transição de status (override manual)
                  </summary>
                  <p className="mb-3 mt-2 text-xs text-slate-500">
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
                      className="min-w-[160px] flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
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
                </details>
              </Card>
            )}
          </div>
        </div>
      )}

      {tab === "evidence" && <EvidenceTab hypothesisId={id} projectId={project.id} role={role} />}

      {tab === "research" && (
        <>
          <HypothesisAiAnalysisCard hypothesisId={id} canEdit={role !== "viewer"} />
          <ResearchMiniList hypothesisId={id} projectId={project.id} role={role} />
        </>
      )}

      {tab === "experiments" && (
        <ExperimentsMiniList hypothesisId={id} projectId={project.id} canManage={canManage} />
      )}

      {tab === "simulations" && (
        <SimulationsMiniList hypothesisId={id} projectId={project.id} canManage={canManage} />
      )}

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
