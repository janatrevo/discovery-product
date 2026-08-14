import { createGuide } from "../actions";
import { Button, Card, Field, Input, Label, PageHeader, Textarea } from "@/components/ui/primitives";

export default async function NewGuidePage({
  searchParams,
}: {
  searchParams: Promise<{ hypothesisId?: string }>;
}) {
  const { hypothesisId } = await searchParams;
  return (
    <div className="max-w-lg">
      <PageHeader title="Novo roteiro de entrevista" />
      <Card>
        <form action={createGuide}>
          <input type="hidden" name="hypothesisId" value={hypothesisId ?? ""} />
          <Field>
            <Label>Título</Label>
            <Input name="title" required />
          </Field>
          <Field>
            <Label>Objetivo</Label>
            <Textarea name="objective" rows={2} />
          </Field>
          <Field>
            <Label>Cenário</Label>
            <Textarea name="scenario" rows={2} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field>
              <Label>JTBD — contexto</Label>
              <Input name="jtbdContext" />
            </Field>
            <Field>
              <Label>JTBD — motivação</Label>
              <Input name="jtbdMotivation" />
            </Field>
            <Field>
              <Label>JTBD — obstáculo</Label>
              <Input name="jtbdObstacle" />
            </Field>
            <Field>
              <Label>JTBD — resultado esperado</Label>
              <Input name="jtbdExpectedOutcome" />
            </Field>
          </div>
          <Field>
            <Label>Perguntas (uma por linha)</Label>
            <Textarea name="questions" rows={5} />
          </Field>
          <Button type="submit">Criar roteiro</Button>
        </form>
      </Card>
    </div>
  );
}
