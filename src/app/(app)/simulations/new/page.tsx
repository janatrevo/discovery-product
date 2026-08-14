import { getPageContext } from "@/lib/page-context";
import { db } from "@/db";
import { personas, products, hypotheses } from "@/db/schema";
import { eq } from "drizzle-orm";
import { runSimulation } from "../actions";
import { Button, Card, Field, Input, Label, PageHeader, Select, Textarea } from "@/components/ui/primitives";
import { SimulationBanner } from "@/components/origin-badge";

export default async function NewSimulationPage({
  searchParams,
}: {
  searchParams: Promise<{ hypothesisId?: string }>;
}) {
  const { hypothesisId } = await searchParams;
  const { project } = await getPageContext();
  const [personaOptions, productOptions, hyp] = await Promise.all([
    db.select().from(personas).where(eq(personas.projectId, project.id)),
    db.select().from(products).where(eq(products.projectId, project.id)),
    hypothesisId ? db.select().from(hypotheses).where(eq(hypotheses.id, hypothesisId)).limit(1).then((r) => r[0]) : null,
  ]);

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Simulation Studio"
        description={hyp ? `Exploração para: ${hyp.title}` : "Exploração de perspectiva de persona sobre um cenário"}
      />
      <SimulationBanner mode="scenario" />
      <Card className="mt-4">
        <form action={runSimulation.bind(null, hypothesisId ?? null)}>
          <Field>
            <Label>Personas (selecione uma ou mais)</Label>
            <select name="personaIds" multiple required className="h-32 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              {personaOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.origin === "synthetic" ? "(sintética)" : "(research-based)"}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <Label>Produto/conceito (opcional)</Label>
            <Select name="productId" defaultValue="">
              <option value="">—</option>
              {productOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <Label>Ou descreva o produto livremente</Label>
            <Textarea name="productDescription" rows={2} />
          </Field>
          <Field>
            <Label>Cenário</Label>
            <Textarea name="scenario" rows={2} required placeholder="Ex.: Precisa criar uma campanha rapidamente" />
          </Field>
          <Field>
            <Label>Tarefa</Label>
            <Input name="task" required placeholder="Ex.: Criar sua primeira campanha" />
          </Field>
          <Button type="submit">Rodar simulação exploratória</Button>
        </form>
      </Card>
    </div>
  );
}
