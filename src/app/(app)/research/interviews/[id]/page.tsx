import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { interviewGuides, interviewGuideQuestions, interviews, personas } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { Button, Card, EmptyState, Field, Input, Label, PageHeader, Select, Textarea } from "@/components/ui/primitives";
import { logInterview } from "../actions";

export default async function GuideDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project, role } = await getPageContext();
  const [guide] = await db.select().from(interviewGuides).where(eq(interviewGuides.id, id)).limit(1);
  if (!guide || guide.projectId !== project.id) notFound();

  const [questions, interviewList, personaOptions] = await Promise.all([
    db.select().from(interviewGuideQuestions).where(eq(interviewGuideQuestions.guideId, id)).orderBy(interviewGuideQuestions.orderIndex),
    db.select().from(interviews).where(eq(interviews.guideId, id)).orderBy(desc(interviews.createdAt)),
    db.select().from(personas).where(eq(personas.projectId, project.id)),
  ]);

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader title={guide.title} description={guide.objective ?? undefined} />

      <Card>
        <p className="mb-2 text-sm font-semibold text-slate-700">Roteiro</p>
        {guide.scenario && <p className="text-sm text-slate-600">Cenário: {guide.scenario}</p>}
        <ol className="mt-2 list-inside list-decimal space-y-0.5 text-sm text-slate-700">
          {questions.map((q) => (
            <li key={q.id}>{q.questionText}</li>
          ))}
        </ol>
      </Card>

      <Card>
        <p className="mb-2 text-sm font-semibold text-slate-700">Entrevistas realizadas ({interviewList.length})</p>
        {interviewList.length === 0 ? (
          <EmptyState title="Nenhuma entrevista registrada ainda" />
        ) : (
          <ul className="space-y-1">
            {interviewList.map((iv) => (
              <li key={iv.id}>
                <Link href={`/research/interviews/${id}/interview/${iv.id}`} className="text-sm hover:underline">
                  {iv.intervieweeRef || "Entrevistado"} — {new Date(iv.interviewDate).toLocaleDateString("pt-BR")}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {role !== "viewer" && (
        <Card>
          <p className="mb-3 text-sm font-semibold text-slate-700">Registrar nova entrevista</p>
          <form action={logInterview.bind(null, id)}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field>
                <Label>Identificação do entrevistado</Label>
                <Input name="intervieweeRef" placeholder="Ex.: P07 - gerente de marketing" />
              </Field>
              <Field>
                <Label>Persona</Label>
                <Select name="personaId" defaultValue="">
                  <option value="">—</option>
                  {personaOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field>
              <Label>Transcrição</Label>
              <Textarea name="transcript" rows={8} placeholder="Cole a transcrição completa da entrevista" />
            </Field>
            <Button type="submit">Registrar entrevista</Button>
          </form>
        </Card>
      )}
    </div>
  );
}
