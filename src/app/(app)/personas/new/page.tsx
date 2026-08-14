import { createPersona } from "../actions";
import { PersonaFormFields } from "@/components/persona-form-fields";
import { Button, PageHeader } from "@/components/ui/primitives";

export default function NewPersonaPage() {
  return (
    <div>
      <PageHeader title="Nova persona" description="Preencha ao menos o bloco essencial — o resto pode vir depois." />
      <form action={createPersona} className="max-w-3xl">
        <PersonaFormFields />
        <div className="mt-6 flex gap-2">
          <Button type="submit">Criar persona</Button>
        </div>
      </form>
    </div>
  );
}
