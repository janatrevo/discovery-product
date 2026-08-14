import { createHypothesis } from "../actions";
import { HypothesisFormFields } from "@/components/hypothesis-form-fields";
import { Button, PageHeader } from "@/components/ui/primitives";
import { getPageContext } from "@/lib/page-context";
import { db } from "@/db";
import { personas, products } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function NewHypothesisPage() {
  const { project } = await getPageContext();
  const [personaOptions, productOptions] = await Promise.all([
    db.select().from(personas).where(eq(personas.projectId, project.id)),
    db.select().from(products).where(eq(products.projectId, project.id)),
  ]);

  return (
    <div>
      <PageHeader title="Nova hipótese" description="A entidade central da plataforma — tudo se conecta a ela." />
      <form action={createHypothesis} className="max-w-3xl">
        <HypothesisFormFields personaOptions={personaOptions} productOptions={productOptions} />
        <div className="mt-6 flex gap-2">
          <Button type="submit">Criar hipótese</Button>
        </div>
      </form>
    </div>
  );
}
