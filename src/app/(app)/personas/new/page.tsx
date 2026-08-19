import { db } from "@/db";
import { products } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { createPersona } from "../actions";
import { PersonaFormFields } from "@/components/persona-form-fields";
import { Button, PageHeader } from "@/components/ui/primitives";

export default async function NewPersonaPage() {
  const { project } = await getPageContext();
  const productList = await db.select().from(products).where(eq(products.projectId, project.id));

  return (
    <div>
      <PageHeader title="Nova persona" description="Preencha ao menos o bloco essencial — o resto pode vir depois." />
      <form action={createPersona} className="max-w-3xl">
        <PersonaFormFields products={productList} />
        <div className="mt-6 flex gap-2">
          <Button type="submit">Criar persona</Button>
        </div>
      </form>
    </div>
  );
}
