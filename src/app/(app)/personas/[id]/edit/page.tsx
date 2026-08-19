import { notFound } from "next/navigation";
import { db } from "@/db";
import { personas, products } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { PersonaFormFields } from "@/components/persona-form-fields";
import { Button, PageHeader } from "@/components/ui/primitives";
import { updatePersona } from "../../actions";

export default async function EditPersonaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project } = await getPageContext();
  const [persona] = await db.select().from(personas).where(eq(personas.id, id)).limit(1);
  if (!persona || persona.projectId !== project.id) notFound();
  const productList = await db.select().from(products).where(eq(products.projectId, project.id));

  const boundUpdate = updatePersona.bind(null, id);

  return (
    <div>
      <PageHeader title={`Editar: ${persona.name}`} />
      <form action={boundUpdate} className="max-w-3xl">
        <PersonaFormFields defaultValues={persona} products={productList} />
        <div className="mt-6 flex gap-2">
          <Button type="submit">Salvar alterações</Button>
        </div>
      </form>
    </div>
  );
}
