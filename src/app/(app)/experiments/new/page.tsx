import { notFound } from "next/navigation";
import { db } from "@/db";
import { hypotheses, personas } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { createExperiment } from "../actions";
import { recommendExperimentMethods } from "@/lib/ai";
import { HYPOTHESIS_TYPES } from "@/lib/hypothesis-types";
import { Button, Card, Field, Input, Label, PageHeader, Select, Textarea } from "@/components/ui/primitives";

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

  const personaOptions = await db.select().from(personas).where(eq(personas.projectId, project.id));
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
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <Label>Método</Label>
              <Select name="method" defaultValue={recommendations[0]?.method ?? "interview"}>
                {Object.entries(METHOD_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
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
          </div>
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
