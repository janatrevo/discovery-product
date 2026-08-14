import { createSurvey } from "../actions";
import { Button, Card, Field, Input, Label, PageHeader, Textarea } from "@/components/ui/primitives";

export default async function NewSurveyPage({
  searchParams,
}: {
  searchParams: Promise<{ hypothesisId?: string }>;
}) {
  const { hypothesisId } = await searchParams;
  return (
    <div className="max-w-lg">
      <PageHeader title="Novo survey" description="Pesquisa quantitativa — objetivo e hipótese primeiro, questionário depois." />
      <Card>
        <form action={createSurvey}>
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
            <Label>Público-alvo</Label>
            <Input name="targetAudience" />
          </Field>
          <Field>
            <Label>Meta de amostra</Label>
            <Input name="sampleTarget" type="number" defaultValue={30} />
          </Field>
          <Button type="submit">Criar e montar questionário</Button>
        </form>
      </Card>
    </div>
  );
}
