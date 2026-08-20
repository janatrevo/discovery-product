import { notFound } from "next/navigation";
import { db } from "@/db";
import { hypotheses, hypothesisPersonas, personas, products } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { HypothesisFormFields } from "@/components/hypothesis-form-fields";
import { Button, PageHeader } from "@/components/ui/primitives";
import { updateHypothesis } from "../../actions";

export default async function EditHypothesisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project } = await getPageContext();
  const [hyp] = await db.select().from(hypotheses).where(eq(hypotheses.id, id)).limit(1);
  if (!hyp || hyp.projectId !== project.id) notFound();

  const [personaOptions, productOptions, hypothesisOptions, selectedPersonas] = await Promise.all([
    db.select().from(personas).where(eq(personas.projectId, project.id)),
    db.select().from(products).where(eq(products.projectId, project.id)),
    db.select().from(hypotheses).where(eq(hypotheses.projectId, project.id)),
    db.select().from(hypothesisPersonas).where(eq(hypothesisPersonas.hypothesisId, id)),
  ]);

  return (
    <div>
      <PageHeader title={`Editar: ${hyp.title}`} />
      <form action={updateHypothesis.bind(null, id)} className="max-w-3xl">
        <HypothesisFormFields
          defaultValues={hyp}
          personaOptions={personaOptions}
          productOptions={productOptions}
          hypothesisOptions={hypothesisOptions}
          selectedPersonaIds={selectedPersonas.map((p) => p.personaId)}
        />
        <div className="mt-6 flex gap-2">
          <Button type="submit">Salvar</Button>
        </div>
      </form>
    </div>
  );
}
