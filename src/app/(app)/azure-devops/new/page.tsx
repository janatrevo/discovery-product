import { getPageContext } from "@/lib/page-context";
import { redirect } from "next/navigation";
import { Button, Card, Field, Input, Label, PageHeader, Textarea } from "@/components/ui/primitives";
import { createAzureFeature } from "../actions";

export default async function NewAzureFeaturePage() {
  const { role } = await getPageContext();
  if (role !== "owner") redirect("/azure-devops");

  return (
    <div>
      <PageHeader
        title="Nova Feature — Azure DevOps"
        description="Cria um card do tipo Feature diretamente no board Trevo Labs."
      />
      <Card className="max-w-2xl">
        <form action={createAzureFeature}>
          <Field>
            <Label>Título</Label>
            <Input name="title" required autoFocus />
          </Field>
          <Field>
            <Label>Descrição</Label>
            <Textarea name="description" rows={5} />
          </Field>
          <Field>
            <Label>Tags (uma por linha, opcional)</Label>
            <Textarea name="tags" rows={2} placeholder={"discovery\nQ3"} />
          </Field>
          <Button type="submit">Criar no Azure DevOps</Button>
        </form>
      </Card>
    </div>
  );
}
