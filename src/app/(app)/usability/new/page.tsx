import { getPageContext } from "@/lib/page-context";
import { db } from "@/db";
import { personas, hypotheses } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createUsabilityTest } from "../actions";
import { Button, Card, Field, Input, Label, PageHeader, Textarea } from "@/components/ui/primitives";
import { SimulationBanner } from "@/components/origin-badge";

export default async function NewUsabilityTestPage({
  searchParams,
}: {
  searchParams: Promise<{ hypothesisId?: string }>;
}) {
  const { hypothesisId } = await searchParams;
  const { project } = await getPageContext();
  const [personaOptions, hyp] = await Promise.all([
    db.select().from(personas).where(eq(personas.projectId, project.id)),
    hypothesisId ? db.select().from(hypotheses).where(eq(hypotheses.id, hypothesisId)).limit(1).then((r) => r[0]) : null,
  ]);

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Usability / Image Test Studio"
        description={hyp ? `Para a hipótese: ${hyp.title}` : "Envie um screenshot, wireframe ou protótipo para análise por persona"}
      />
      <SimulationBanner mode="image" />
      <Card className="mt-4">
        <form action={createUsabilityTest.bind(null, hypothesisId ?? null)} encType="multipart/form-data">
          <Field>
            <Label>Título</Label>
            <Input name="title" placeholder="Ex.: Tela de onboarding v2" />
          </Field>
          <Field>
            <Label>Imagem (screenshot, wireframe, protótipo...)</Label>
            <input
              type="file"
              name="image"
              accept="image/png,image/jpeg,image/webp"
              required
              className="block w-full text-sm"
            />
          </Field>
          <Field>
            <Label>Personas</Label>
            <select name="personaIds" multiple required className="h-28 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              {personaOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <Label>Cenário</Label>
            <Textarea name="scenario" rows={2} />
          </Field>
          <Field>
            <Label>Tarefa</Label>
            <Input name="task" />
          </Field>
          <Button type="submit">Analisar com IA</Button>
        </form>
      </Card>
    </div>
  );
}
