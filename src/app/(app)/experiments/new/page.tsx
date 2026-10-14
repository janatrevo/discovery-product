import { notFound } from "next/navigation";
import { db } from "@/db";
import { hypotheses, personas, surveys, interviewGuides, surveyResponses, interviews } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { createExperiment } from "../actions";
import { recommendExperimentMethods } from "@/lib/ai";
import { HYPOTHESIS_TYPES } from "@/lib/hypothesis-types";
import { Button, Card, Field, Input, Label, PageHeader, Select, Textarea } from "@/components/ui/primitives";
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

  const [personaOptions, allSurveys, allGuides, linkedSurveys, linkedGuides, responseCounts, interviewCounts] =
    await Promise.all([
      db.select().from(personas).where(eq(personas.projectId, project.id)),
      db.select().from(surveys).where(eq(surveys.projectId, project.id)),
      db.select().from(interviewGuides).where(eq(interviewGuides.projectId, project.id)),
      surveysForHypothesis(hypothesisId),
      guidesForHypothesis(hypothesisId),
      db
        .select({ surveyId: surveyResponses.surveyId, count: sql<number>`count(*)::int` })
        .from(surveyResponses)
        .groupBy(surveyResponses.surveyId),
      db
        .select({ guideId: interviews.guideId, count: sql<number>`count(*)::int` })
        .from(interviews)
        .where(eq(interviews.projectId, project.id))
        .groupBy(interviews.guideId),
    ]);

  // Pesquisas já vinculadas a esta hipótese aparecem primeiro na lista.
  const linkedSurveyIds = new Set(linkedSurveys.map((s) => s.id));
  const linkedGuideIds = new Set(linkedGuides.map((g) => g.id));
  const surveyOptions = allSurveys
    .map((s) => ({
      id: s.id,
      title: s.title,
      detail: `${s.status} · ${responseCounts.find((r) => r.surveyId === s.id)?.count ?? 0} resposta(s)`,
      linked: linkedSurveyIds.has(s.id),
    }))
    .sort((a, b) => Number(b.linked) - Number(a.linked));
  const guideOptions = allGuides
    .map((g) => ({
      id: g.id,
      title: g.title,
      detail: `${interviewCounts.find((c) => c.guideId === g.id)?.count ?? 0} entrevista(s)`,
      linked: linkedGuideIds.has(g.id),
    }))
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
          <Field>
            <Label>Objetivo</Label>
            <Textarea name="objective" rows={2} />
          </Field>
          <ExperimentMethodFields
            methods={Object.entries(METHOD_LABELS).map(([value, label]) => ({ value, label }))}
            defaultMethod={recommendations[0]?.method ?? "interview"}
            surveys={surveyOptions}
            guides={guideOptions}
            hypothesisId={hypothesisId}
          />
          <Field>
            <Label>Persona</Label>
            <Select name="personaId" defaultValue="">
              <option value="">—</option>
              {personaOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.jobTitle ? ` — ${p.jobTitle}` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <Label>Variável testada</Label>
            <Input name="variable" />
          </Field>
          <Field>
            <Label>Métrica</Label>
            <Input name="metric" />
          </Field>
          <Field>
            <Label>Amostra planejada</Label>
            <Input name="samplePlanned" type="number" />
          </Field>
          <Field>
            <Label>Resultado esperado</Label>
            <Textarea name="resultExpected" rows={2} />
          </Field>
          <Button type="submit">Criar experimento</Button>
        </form>
      </Card>
    </div>
  );
}
