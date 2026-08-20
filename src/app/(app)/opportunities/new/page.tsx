import { getPageContext } from "@/lib/page-context";
import { db } from "@/db";
import { personas, hypotheses } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createOpportunity } from "../actions";
import { Button, Card, Field, Input, Label, PageHeader, Select, Textarea } from "@/components/ui/primitives";

const SCORE_FIELDS = [
  { name: "impact", label: "Impacto no usuário" },
  { name: "frequency", label: "Frequência do problema" },
  { name: "severity", label: "Severidade" },
  { name: "businessPotential", label: "Potencial de negócio" },
  { name: "solutionEase", label: "Facilidade de solução" },
];

export default async function NewOpportunityPage({
  searchParams,
}: {
  searchParams: Promise<{ hypothesisId?: string }>;
}) {
  const { hypothesisId } = await searchParams;
  const { project } = await getPageContext();

  const [personaList, hypothesisList] = await Promise.all([
    db.select().from(personas).where(eq(personas.projectId, project.id)),
    db.select().from(hypotheses).where(eq(hypotheses.projectId, project.id)),
  ]);

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Nova oportunidade"
        description="Vincule a uma hipótese sempre que possível — a confiança de evidência dela entra automaticamente no cálculo de priorização."
      />
      <Card>
        <form action={createOpportunity}>
          <Field>
            <Label>Título</Label>
            <Input name="title" required placeholder="Ex.: Reduzir fricção no checkout para PMEs" />
          </Field>
          <Field>
            <Label>Descrição</Label>
            <Textarea name="description" rows={3} />
          </Field>
          <Field>
            <Label>Referência do problema (obrigatório se nenhuma hipótese for selecionada abaixo)</Label>
            <Input name="problemRef" placeholder="Trecho ou resumo do problema observado" />
          </Field>
          <Field>
            <Label>Hipótese de origem (opcional, mas recomendado)</Label>
            <Select name="hypothesisId" defaultValue={hypothesisId ?? ""}>
              <option value="">— nenhuma —</option>
              {hypothesisList.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.title} (confiança: {h.confidenceScore ?? 0})
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <Label>Persona</Label>
            <Select name="personaId" defaultValue="">
              <option value="">— nenhuma —</option>
              {personaList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.jobTitle ? ` — ${p.jobTitle}` : ""}
                </option>
              ))}
            </Select>
          </Field>

          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {SCORE_FIELDS.map((f) => (
              <Field key={f.name}>
                <Label>
                  {f.label} (1-5{f.name === "solutionEase" ? ", 5 = mais fácil" : ""})
                </Label>
                <Select name={f.name} defaultValue="3">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>

          <Button type="submit">Mapear oportunidade</Button>
        </form>
      </Card>
    </div>
  );
}
