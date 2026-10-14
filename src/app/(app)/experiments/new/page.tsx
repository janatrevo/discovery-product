import { notFound } from "next/navigation";
import { db } from "@/db";
import { hypotheses, personas, surveys, interviewGuides, surveyResponses, interviews } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { createExperiment } from "../actions";
import { recommendExperimentMethods } from "@/lib/ai";
import { HYPOTHESIS_TYPES } from "@/lib/hypothesis-types";
import { Button, Card, PageHeader } from "@/components/ui/primitives";
import { ExperimentMethodFields } from "@/components/experiment-method-fields";
import { surveysForHypothesis, guidesForHypothesis } from "@/lib/research-links";

const METHOD_LABELS: Record<string, string> = {
  interview: "Entrevista",
  survey: "Survey",
  usability_test: "Teste de usabilidade",
  concept_test: "Teste de conceito",
  landing_page: "Landing page",
  fake_door: "Fake door",
  ab_test: "A/B test",
  prototype_test: "Teste de protótipo",
  price_test: "Teste de preço",
};

export default async function NewExperimentPage({
  searchParams,
}: {
  searchParams: Promise<{ hypothesisId?: string }>;
}) {
  const { hypothesisId } = await searchParams;
  if (!hypothesisId) notFound();
  const { project } = await getPageContext();
  const [hyp] = await db.select().from(hypotheses).where(eq(hypotheses.id, hypothesisId)).limit(1);
  if (!hyp || hyp.projectId !== project.id) notFound();

  const [personaOptions, allSurveys, allGuides, linkedSurveys, linkedGuides, responseCounts, guideInterviews] =
    await Promise.all([
      db.select().from(personas).where(eq(personas.projectId, project.id)),
      db.select().from(surveys).where(eq(surveys.projectId, project.id)),
      db.select().from(interviewGuides).where(eq(interviewGuides.projectId, project.id)),
      surveysForHypothesis(hypothesisId),
      guidesForHypothesis(hypothesisId),
      db
        .select({ surveyId: surveyResponses.surveyId, count: sql<number>`count(*)::int` })
        .from(surveyResponses)
        .innerJoin(surveys, eq(surveys.id, surveyResponses.surveyId))
        .where(eq(surveys.projectId, project.id))
        .groupBy(surveyResponses.surveyId),
      db
        .select({ guideId: interviews.guideId, personaId: interviews.personaId })
        .from(interviews)
        .where(eq(interviews.projectId, project.id)),
    ]);

  // Entrevistas por roteiro e persona mais frequente entre elas.
  const interviewsByGuide = new Map<string, { total: number; personas: Map<string, number> }>();
  for (const iv of guideInterviews) {
    if (!iv.guideId) continue;
    const entry = interviewsByGuide.get(iv.guideId) ?? { total: 0, personas: new Map<string, number>() };
    entry.total += 1;
    if (iv.personaId) entry.personas.set(iv.personaId, (entry.personas.get(iv.personaId) ?? 0) + 1);
    interviewsByGuide.set(iv.guideId, entry);
  }

  const norm = (t: string) =>
    t
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  // Survey não tem persona própria: tenta achar uma cujo nome ou cargo
  // apareça no público-alvo escrito no survey.
  function personaFromAudience(audience: string | null) {
    if (!audience) return null;
    const text = norm(audience);
    const hit = personaOptions.find(
      (p) => (p.jobTitle && norm(p.jobTitle).length > 2 && text.includes(norm(p.jobTitle))) || text.includes(norm(p.name))
    );
    return hit ?? null;
  }

  // Pesquisas já vinculadas a esta hipótese aparecem primeiro na lista.
  const linkedSurveyIds = new Set(linkedSurveys.map((s) => s.id));
  const linkedGuideIds = new Set(linkedGuides.map((g) => g.id));
  const surveyOptions = allSurveys
    .map((s) => {
      const persona = personaFromAudience(s.targetAudience);
      return {
        id: s.id,
        title: s.title,
        detail: `${s.status} · ${responseCounts.find((r) => r.surveyId === s.id)?.count ?? 0} resposta(s)`,
        linked: linkedSurveyIds.has(s.id),
        suggest: {
          objective: s.objective ?? undefined,
          sample: s.sampleTarget ?? undefined,
          sampleWhy: "meta de respostas do survey",
          personaId: persona?.id,
          personaWhy: persona ? "citada no público-alvo do survey" : undefined,
        },
      };
    })
    .sort((a, b) => Number(b.linked) - Number(a.linked));
  const guideOptions = allGuides
    .map((g) => {
      const info = interviewsByGuide.get(g.id);
      let personaId: string | undefined;
      let top = 0;
      for (const [pid, n] of info?.personas ?? []) {
        if (n > top) {
          personaId = pid;
          top = n;
        }
      }
      return {
        id: g.id,
        title: g.title,
        detail: `${info?.total ?? 0} entrevista(s)`,
        linked: linkedGuideIds.has(g.id),
        suggest: {
          objective: g.objective ?? undefined,
          expected: g.jtbdExpectedOutcome ?? undefined,
          sample: info?.total || undefined,
          sampleWhy: "entrevistas já realizadas com o roteiro",
          personaId,
          personaWhy: personaId ? `${top} de ${info?.total} entrevistas` : undefined,
        },
      };
    })
    .sort((a, b) => Number(b.linked) - Number(a.linked));
  const recommendations = recommendExperimentMethods(hyp.type);
  const typeInfo = HYPOTHESIS_TYPES.find((t) => t.value === hyp.type);

  return (
    <div className="max-w-2xl">
      <PageHeader title="Novo experimento" description={`Para a hipótese: ${hyp.title}`} />

      <Card className="mb-4 bg-indigo-50">
        <p className="text-sm font-semibold text-slate-700">
          Método recomendado para hipóteses do tipo {typeInfo?.label}
        </p>
        <ul className="mt-1 space-y-1 text-sm text-slate-600">
          {recommendations.map((r) => (
            <li key={r.method}>
              <strong>{METHOD_LABELS[r.method] ?? r.method}</strong> — {r.why}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-400">
          Recomendação por regra determinística (árvore de decisão), não por IA generativa — você
          pode discordar e escolher outro método livremente.
        </p>
      </Card>

      <Card>
        <form action={createExperiment.bind(null, hypothesisId)}>
          <ExperimentMethodFields
            methods={Object.entries(METHOD_LABELS).map(([value, label]) => ({ value, label }))}
            defaultMethod={recommendations[0]?.method ?? "interview"}
            surveys={surveyOptions}
            guides={guideOptions}
            personas={personaOptions.map((p) => ({ id: p.id, label: p.jobTitle ? `${p.name} — ${p.jobTitle}` : p.name }))}
            hypothesisId={hypothesisId}
          />
          <Button type="submit">Criar experimento</Button>
        </form>
      </Card>
    </div>
  );
}
