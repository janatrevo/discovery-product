import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import {
  personas,
  products,
  evidence,
  personaVersions,
  experiments,
  interviews,
  usabilityFindings,
  opportunities,
  simulationRuns,
  simulationResponses,
} from "@/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { Badge, Button, Card, PageHeader } from "@/components/ui/primitives";
import { OriginBadge } from "@/components/origin-badge";
import { deletePersona } from "../actions";
import { unlinkPersonaFromExperiment } from "../../experiments/actions";
import { unlinkPersonaFromEvidence } from "../../repository/actions";
import { unlinkPersonaFromInterview } from "../../research/interviews/actions";
import { unlinkPersonaFromFinding } from "../../usability/actions";
import { unlinkPersonaFromOpportunity } from "../../opportunities/actions";
import { deleteSimulation } from "../../simulations/actions";

function Block({ title, items }: { title: string; items?: string[] | null }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{title}</p>
      <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm text-slate-700">
        {items.map((i, idx) => (
          <li key={idx}>{i}</li>
        ))}
      </ul>
    </div>
  );
}

export default async function PersonaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project, role } = await getPageContext();
  const [persona] = await db
    .select()
    .from(personas)
    .where(eq(personas.id, id))
    .limit(1);
  if (!persona || persona.projectId !== project.id) notFound();

  const [linkedProduct] = persona.productId
    ? await db.select().from(products).where(eq(products.id, persona.productId)).limit(1)
    : [];

  // Espelha exatamente o que checkPersonaDeletable (src/lib/delete-guards.ts)
  // verifica antes de excluir — antes disso, quem tentasse excluir uma
  // persona vinculada só via um "Runtime Error" cheio de stack trace, sem
  // saber o que estava bloqueando nem como resolver. Agora a própria página
  // mostra cada vínculo com um jeito de desvincular (ou excluir, no caso de
  // simulação) direto por aqui. Todas essas consultas rodam em paralelo
  // (Promise.all) — em série elas deixavam esta página visivelmente mais
  // lenta para renderizar do que as outras.
  const canDelete = role === "owner" || role === "editor";
  const [linkedEvidence, versions, blockingExperiments, blockingInterviews, blockingFindings, blockingOpportunities, blockingResponseRows] =
    await Promise.all([
      db.select().from(evidence).where(eq(evidence.personaId, id)),
      db.select().from(personaVersions).where(eq(personaVersions.personaId, id)).orderBy(desc(personaVersions.createdAt)),
      canDelete ? db.select().from(experiments).where(eq(experiments.personaId, id)) : Promise.resolve([]),
      canDelete ? db.select().from(interviews).where(eq(interviews.personaId, id)) : Promise.resolve([]),
      canDelete ? db.select().from(usabilityFindings).where(eq(usabilityFindings.personaId, id)) : Promise.resolve([]),
      canDelete ? db.select().from(opportunities).where(eq(opportunities.personaId, id)) : Promise.resolve([]),
      canDelete
        ? db.select({ simulationRunId: simulationResponses.simulationRunId }).from(simulationResponses).where(eq(simulationResponses.personaId, id))
        : Promise.resolve([]),
    ]);
  const blockingRunIds = [...new Set(blockingResponseRows.map((r) => r.simulationRunId))];
  const blockingSimulationRuns = blockingRunIds.length
    ? await db.select().from(simulationRuns).where(inArray(simulationRuns.id, blockingRunIds))
    : [];
  const hasBlockers =
    canDelete &&
    (linkedEvidence.length > 0 ||
      blockingExperiments.length > 0 ||
      blockingInterviews.length > 0 ||
      blockingFindings.length > 0 ||
      blockingOpportunities.length > 0 ||
      blockingSimulationRuns.length > 0);
  const canDeleteNow = canDelete && !hasBlockers;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={persona.name}
        description={persona.shortDescription ?? undefined}
        actions={
          <>
            <Link href={`/personas/${id}/edit`}>
              <Button variant="secondary">Editar</Button>
            </Link>
            {canDeleteNow && (
              <form action={deletePersona.bind(null, id)}>
                <Button variant="danger" type="submit">
                  Excluir
                </Button>
              </form>
            )}
          </>
        }
      />

      {hasBlockers && (
        <Card className="mb-4 border-amber-300 bg-amber-50">
          <p className="text-sm font-medium text-amber-900">Esta persona não pode ser excluída ainda</p>
          <p className="mt-1 text-sm text-amber-800">
            Desvincule (ou exclua, no caso de simulações) as referências abaixo para liberar a exclusão.
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
                    <form action={unlinkPersonaFromExperiment.bind(null, e.id, id)}>
                      <Button type="submit" variant="ghost" size="sm">
                        desvincular
                      </Button>
                    </form>
                  </div>
                ))}
              </div>
            </div>
          )}

          {blockingInterviews.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase text-amber-700">
                Entrevistas ({blockingInterviews.length})
              </p>
              <div className="mt-1 space-y-2">
                {blockingInterviews.map((i) => (
                  <div key={i.id} className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-white px-3 py-2">
                    <Link href={i.guideId ? `/research/interviews/${i.guideId}` : "/research/interviews"} className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-800">{i.intervieweeRef || "Entrevista sem identificação"}</p>
                    </Link>
                    <form action={unlinkPersonaFromInterview.bind(null, i.id, id)}>
                      <Button type="submit" variant="ghost" size="sm">
                        desvincular
                      </Button>
                    </form>
                  </div>
                ))}
              </div>
            </div>
          )}

          {linkedEvidence.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase text-amber-700">
                Evidências ({linkedEvidence.length})
              </p>
              <div className="mt-1 space-y-2">
                {linkedEvidence.map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-white px-3 py-2">
                    <Link href="/repository" className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-800">{e.source}</p>
                    </Link>
                    <form action={unlinkPersonaFromEvidence.bind(null, e.id, id)}>
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
                    <form action={unlinkPersonaFromFinding.bind(null, f.id, id)}>
                      <Button type="submit" variant="ghost" size="sm">
                        desvincular
                      </Button>
                    </form>
                  </div>
                ))}
              </div>
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
                    <form action={unlinkPersonaFromOpportunity.bind(null, o.id, id)}>
                      <Button type="submit" variant="ghost" size="sm">
                        desvincular
                      </Button>
                    </form>
                  </div>
                ))}
              </div>
            </div>
          )}

          {blockingSimulationRuns.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase text-amber-700">
                Simulações ({blockingSimulationRuns.length})
              </p>
              <div className="mt-1 space-y-2">
                {blockingSimulationRuns.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-white px-3 py-2">
                    <Link href={`/simulations/${s.id}`} className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-800">{s.scenario || "Cenário sem título"}</p>
                    </Link>
                    <form action={deleteSimulation.bind(null, s.id, `/personas/${id}`)}>
                      <Button type="submit" variant="ghost" size="sm">
                        excluir simulação
                      </Button>
                    </form>
                  </div>
                ))}
              </div>
              <p className="mt-1 text-xs text-amber-700">
                Respostas de simulação não podem ser desvinculadas individualmente — só excluindo a simulação
                inteira (isso também remove as respostas de outras personas que tenham participado da mesma rodada).
              </p>
            </div>
          )}
        </Card>
      )}

      <div className="mb-4 flex items-center gap-2">
        <Badge color={persona.origin === "research_based" ? "emerald" : "amber"}>
          {persona.origin === "research_based" ? "Research-based" : "Sintética — não validada por pesquisa"}
        </Badge>
        <span className="text-xs text-slate-400">{persona.completeness}% preenchido</span>
        {linkedProduct && (
          <Link href={`/products/${linkedProduct.id}`}>
            <Badge color="indigo">Produto: {linkedProduct.name}</Badge>
          </Link>
        )}
      </div>

      {persona.jtbdMain && (
        <Card className="mb-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">JTBD principal</p>
          <p className="mt-1 text-sm text-slate-700">{persona.jtbdMain}</p>
        </Card>
      )}

      <Card className="mb-4 space-y-3">
        <p className="text-sm font-semibold text-slate-700">Contexto</p>
        {[
          ["Profissional", persona.professionalContext],
          ["Pessoal", persona.personalContext],
          ["Uso", persona.usageContext],
          ["Compra", persona.purchaseContext],
          ["Familiaridade tecnológica", persona.techFamiliarity],
          ["Sensibilidade a preço", persona.priceSensitivity],
        ]
          .filter(([, v]) => v)
          .map(([label, value]) => (
            <div key={label as string}>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
              <p className="text-sm text-slate-700">{value}</p>
            </div>
          ))}
      </Card>

      <Card className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Block title="Objetivos" items={persona.goals as string[]} />
        <Block title="Dores" items={persona.pains as string[]} />
        <Block title="Frustrações" items={persona.frustrations as string[]} />
        <Block title="Necessidades" items={persona.needs as string[]} />
        <Block title="Motivações" items={persona.motivations as string[]} />
        <Block title="Comportamentos" items={persona.behaviors as string[]} />
        <Block title="Medos" items={persona.fears as string[]} />
        <Block title="Objeções" items={persona.objections as string[]} />
        <Block title="Critérios de decisão" items={persona.decisionCriteria as string[]} />
      </Card>

      {persona.origin === "research_based" && (
        <Card className="mb-4 space-y-3">
          <p className="text-sm font-semibold text-slate-700">Evidência de origem</p>
          <Block title="Citações reais" items={persona.realQuotes as string[]} />
          <Block title="Fontes" items={persona.sources as string[]} />
          {linkedEvidence.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Evidências vinculadas ({linkedEvidence.length})
              </p>
              <ul className="mt-1 space-y-1">
                {linkedEvidence.map((e) => (
                  <li key={e.id} className="flex items-center gap-2 text-sm text-slate-700">
                    <OriginBadge originClass={e.originClass} /> {e.source}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {versions.length > 0 && (
        <Card>
          <p className="mb-2 text-sm font-semibold text-slate-700">Histórico de versões</p>
          <ul className="space-y-1 text-sm text-slate-600">
            {versions.map((v) => (
              <li key={v.id}>
                v{v.versionNo} — {v.changeNote} ({new Date(v.createdAt).toLocaleDateString("pt-BR")})
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
