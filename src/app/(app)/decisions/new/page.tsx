import { getPageContext } from "@/lib/page-context";
import { db } from "@/db";
import { opportunities, hypotheses, evidence } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createDecision } from "../actions";
import { Button, Card, Field, Input, Label, PageHeader, Select, Textarea } from "@/components/ui/primitives";

export default async function NewDecisionPage({
  searchParams,
}: {
  searchParams: Promise<{ opportunityId?: string }>;
}) {
  const { opportunityId } = await searchParams;
  const { project } = await getPageContext();

  const [opportunityList, hypothesisList, evidenceList] = await Promise.all([
    db.select().from(opportunities).where(eq(opportunities.projectId, project.id)),
    db.select().from(hypotheses).where(eq(hypotheses.projectId, project.id)),
    db.select().from(evidence).where(eq(evidence.projectId, project.id)),
  ]);

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Registrar decisão"
        description="O log de decisões é append-only: uma vez registrada, a decisão não é apagada — apenas novas decisões substituem o rumo. É obrigatório referenciar hipótese e/ou evidência, a menos que você marque explicitamente que está sobrepondo a metodologia recomendada."
      />
      <Card>
        <form action={createDecision}>
          <Field>
            <Label>O que foi decidido</Label>
            <Textarea name="decisionText" rows={2} required placeholder="Ex.: Vamos priorizar o fluxo de onboarding simplificado no próximo ciclo." />
          </Field>
          <Field>
            <Label>Racional</Label>
            <Textarea name="rationale" rows={3} placeholder="Por que esta decisão, com base em quê?" />
          </Field>
          <Field>
            <Label>Oportunidade relacionada (opcional)</Label>
            <Select name="opportunityId" defaultValue={opportunityId ?? ""}>
              <option value="">— nenhuma —</option>
              {opportunityList.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <Label>Hipóteses referenciadas</Label>
            <select name="hypothesisRefs" multiple className="h-28 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              {hypothesisList.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.title}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <Label>Evidências referenciadas</Label>
            <select name="evidenceRefs" multiple className="h-28 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              {evidenceList.map((e) => (
                <option key={e.id} value={e.id}>
                  [{e.type}] {e.source}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" name="overriddenMethodology" value="true" />
              Esta decisão foi tomada apesar da metodologia recomendada não ter sido seguida
              (ex.: sem evidência real suficiente, ou contra o Confidence Score calculado).
            </label>
          </Field>
          <Button type="submit">Registrar decisão</Button>
        </form>
      </Card>
    </div>
  );
}
