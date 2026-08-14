import { getPageContext } from "@/lib/page-context";
import { db } from "@/db";
import { hypotheses, personas, products, evidence, experiments, opportunities, decisions } from "@/db/schema";
import { eq, sql, and, isNull, lt } from "drizzle-orm";
import { Card, PageHeader } from "@/components/ui/primitives";
import Link from "next/link";

const OUTCOME_FOLLOWUP_DAYS = 21;

export default async function DashboardPage() {
  const { project } = await getPageContext();
  const pid = project.id;

  const [statusCounts] = await Promise.all([
    db
      .select({ status: hypotheses.status, count: sql<number>`count(*)::int` })
      .from(hypotheses)
      .where(eq(hypotheses.projectId, pid))
      .groupBy(hypotheses.status),
  ]);

  const countBy = (status: string) => statusCounts.find((s) => s.status === status)?.count ?? 0;
  const totalHypotheses = statusCounts.reduce((acc, s) => acc + s.count, 0);

  const [{ count: personaCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(personas)
    .where(eq(personas.projectId, pid));

  const [{ count: productCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(eq(products.projectId, pid));

  const [{ count: evidenceCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(evidence)
    .where(eq(evidence.projectId, pid));

  const [{ count: simulationOnlyEvidence }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(evidence)
    .where(and(eq(evidence.projectId, pid), eq(evidence.originClass, "simulation")));

  const [{ count: experimentsInProgress }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(experiments)
    .where(and(eq(experiments.projectId, pid), eq(experiments.status, "in_progress")));

  const [{ count: opportunityCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(opportunities)
    .where(eq(opportunities.projectId, pid));

  const [{ count: decisionCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(decisions)
    .where(eq(decisions.projectId, pid));

  const followUpCutoff = new Date(Date.now() - OUTCOME_FOLLOWUP_DAYS * 24 * 60 * 60 * 1000);
  const pendingOutcomeCheckins = await db
    .select()
    .from(opportunities)
    .where(
      and(
        eq(opportunities.projectId, pid),
        eq(opportunities.status, "done"),
        isNull(opportunities.outcomeCheckedAt),
        lt(opportunities.doneAt, followUpCutoff)
      )
    );

  const simPct = evidenceCount > 0 ? Math.round((simulationOnlyEvidence / evidenceCount) * 100) : 0;

  // Roteiro do fluxo natural de discovery — mesma ordem do menu lateral e do
  // tour guiado (ver src/components/product-tour.tsx). Some sozinho da tela
  // assim que o projeto já passou por todos os passos, pra não virar ruído
  // pra quem já usa a plataforma no dia a dia.
  const gettingStartedSteps = [
    { label: "Cadastrar um produto ou conceito", done: productCount > 0, href: "/products/new" },
    { label: "Criar uma persona", done: personaCount > 0, href: "/personas/new" },
    { label: "Escrever a primeira hipótese", done: totalHypotheses > 0, href: "/hypotheses/new" },
    { label: "Coletar evidência (survey, entrevista ou teste de usabilidade)", done: evidenceCount > 0, href: "/research" },
    { label: "Mapear uma oportunidade no Discovery Board", done: opportunityCount > 0, href: "/opportunities/new" },
    { label: "Registrar uma decisão", done: decisionCount > 0, href: "/decisions/new" },
  ];
  const showGettingStarted = gettingStartedSteps.some((s) => !s.done);

  const stats = [
    { label: "Hipóteses totais", value: totalHypotheses, href: "/hypotheses" },
    { label: "Validadas", value: countBy("validated"), href: "/hypotheses?status=validated" },
    { label: "Parcialmente validadas", value: countBy("partially_validated"), href: "/hypotheses?status=partially_validated" },
    { label: "Invalidadas", value: countBy("invalidated"), href: "/hypotheses?status=invalidated" },
    { label: "Em investigação", value: countBy("investigating"), href: "/hypotheses?status=investigating" },
    { label: "Sem evidência", value: countBy("not_tested"), href: "/hypotheses?status=not_tested" },
    { label: "Inconclusivas", value: countBy("inconclusive"), href: "/hypotheses?status=inconclusive" },
  ];

  return (
    <div>
      <PageHeader
        title="Discovery Dashboard"
        description={`Visão geral de ${project.name}`}
      />

      {showGettingStarted && (
        <Card className="mb-4">
          <p className="mb-1 text-sm font-semibold text-slate-700">Primeiros passos</p>
          <p className="mb-3 text-xs text-slate-500">
            A ordem sugerida do fluxo de discovery — a mesma do menu lateral. Não é obrigatório seguir
            à risca, mas cada etapa alimenta a próxima. Clique em qualquer item para ir direto lá (ou
            use o &ldquo;🎓 Ver tour guiado&rdquo; no rodapé do menu para uma explicação passo a passo).
          </p>
          <ul className="space-y-1.5">
            {gettingStartedSteps.map((s) => (
              <li key={s.label}>
                <Link
                  href={s.href}
                  className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50 ${
                    s.done ? "text-slate-400 line-through" : "font-medium text-slate-800"
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${
                      s.done ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {s.done ? "✓" : ""}
                  </span>
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className="transition-shadow hover:shadow-md">
              <p className="text-2xl font-semibold text-slate-900">{s.value}</p>
              <p className="mt-1 text-xs text-slate-500">{s.label}</p>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <p className="text-2xl font-semibold text-slate-900">{personaCount}</p>
          <p className="mt-1 text-xs text-slate-500">Personas</p>
        </Card>
        <Card>
          <p className="text-2xl font-semibold text-slate-900">{productCount}</p>
          <p className="mt-1 text-xs text-slate-500">Produtos/Conceitos</p>
        </Card>
        <Card>
          <p className="text-2xl font-semibold text-slate-900">{experimentsInProgress}</p>
          <p className="mt-1 text-xs text-slate-500">Experimentos em andamento</p>
        </Card>
        <Card>
          <p className="text-2xl font-semibold text-slate-900">{decisionCount}</p>
          <p className="mt-1 text-xs text-slate-500">Decisões registradas</p>
        </Card>
      </div>

      <Card className={`mt-4 ${simPct > 40 ? "border-amber-300 bg-amber-50" : ""}`}>
        <p className="text-sm font-medium text-slate-700">
          % de evidência que é apenas simulação de IA:{" "}
          <span className={simPct > 40 ? "text-amber-700" : "text-slate-900"}>{simPct}%</span>
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Este é o indicador de saúde mais importante do processo de discovery — simulação nunca
          conta para o Confidence Score. Se este número estiver alto, é sinal de que decisões podem
          estar se apoiando em exploração de IA em vez de pesquisa real com usuários.
        </p>
      </Card>

      {pendingOutcomeCheckins.length > 0 && (
        <Card className="mt-4 border-amber-300 bg-amber-50">
          <p className="text-sm font-medium text-amber-800">
            {pendingOutcomeCheckins.length} oportunidade(s) concluída(s) há mais de {OUTCOME_FOLLOWUP_DAYS} dias sem
            resultado registrado
          </p>
          <p className="mt-1 text-xs text-amber-700">
            O que aconteceu de fato depois do lançamento? Fecha o ciclo entre o que foi previsto e o que a
            realidade confirmou.
          </p>
          <ul className="mt-2 space-y-1">
            {pendingOutcomeCheckins.slice(0, 5).map((o) => (
              <li key={o.id}>
                <Link href={`/opportunities/${o.id}`} className="text-sm font-medium text-indigo-700 hover:underline">
                  {o.title} →
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mt-4">
        <p className="text-sm font-medium text-slate-700">Discovery Board</p>
        <p className="mt-1 text-xs text-slate-500">{opportunityCount} oportunidades mapeadas.</p>
        <Link href="/opportunities" className="mt-2 inline-block text-xs font-medium text-indigo-600">
          Ver Discovery Board →
        </Link>
      </Card>
    </div>
  );
}
