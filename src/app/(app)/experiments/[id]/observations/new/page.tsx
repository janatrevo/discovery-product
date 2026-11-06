import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { experiments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { Card, PageHeader } from "@/components/ui/primitives";
import { FieldObservationForm } from "@/components/field-observation-form";
import { createFieldObservation } from "../../../observation-actions";

export default async function NewObservationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project, role } = await getPageContext();
  const [exp] = await db.select().from(experiments).where(eq(experiments.id, id)).limit(1);
  if (!exp || exp.projectId !== project.id || exp.method !== "field_observation") notFound();
  if (role === "viewer") notFound();

  return (
    <div className="max-w-2xl space-y-4">
      <PageHeader
        title="Novo registro de observação"
        description="Uma conversa ou observação no local. Pode ter gravação e transcrição, ou só anotações."
      />
      <Card>
        <FieldObservationForm action={createFieldObservation.bind(null, id)} submitLabel="Salvar registro" />
      </Card>
      <Link href={`/experiments/${id}`} className="text-sm font-medium text-indigo-600">
        ← Voltar para o experimento
      </Link>
    </div>
  );
}
