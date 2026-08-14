import { createProject } from "../actions";
import { Button, Card, Field, Input, Label, PageHeader, Textarea } from "@/components/ui/primitives";

export default function NewProjectPage() {
  return (
    <div className="max-w-lg">
      <PageHeader title="Novo projeto" description="Fluxo 1 — criar um novo espaço de discovery." />
      <Card>
        <form action={createProject}>
          <Field>
            <Label>Nome do projeto</Label>
            <Input name="name" required />
          </Field>
          <Field>
            <Label>Descrição</Label>
            <Textarea name="description" rows={3} />
          </Field>
          <Button type="submit">Criar projeto</Button>
        </form>
      </Card>
    </div>
  );
}
