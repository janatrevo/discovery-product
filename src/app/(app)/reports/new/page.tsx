import { generateReport } from "../actions";
import { Button, Card, Field, Input, Label, PageHeader } from "@/components/ui/primitives";

export default async function NewReportPage() {
  return (
    <div className="max-w-xl">
      <PageHeader
        title="Gerar relatório"
        description="O relatório é um snapshot do projeto inteiro no momento da geração: hipóteses, evidências, oportunidades e decisões."
      />
      <Card>
        <form action={generateReport}>
          <Field>
            <Label>Título do relatório</Label>
            <Input name="title" placeholder="Ex.: Status de discovery — Sprint 14" />
          </Field>
          <Button type="submit">Gerar</Button>
        </form>
      </Card>
    </div>
  );
}
