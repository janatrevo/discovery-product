import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { interviewGuides, interviewGuideQuestions, interviews, personas } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { interviewLabel } from "@/lib/interview-label";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Label,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui/primitives";
import {
  logInterview,
  publishGuide,
  updateGuide,
  addGuideQuestion,
  updateGuideQuestion,
  deleteGuideQuestion,
} from "../actions";

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

  const canEdit = role !== "viewer";
  const isDraft = guide.status === "draft";

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader
        title={guide.title}
        description={guide.objective ?? undefined}
        actions={
          <>
            <Badge color={isDraft ? "amber" : "emerald"}>{isDraft ? "rascunho" : "publicado"}</Badge>
            {canEdit && isDraft && (
              <form action={publishGuide.bind(null, id)}>
                <Button type="submit">Publicar roteiro</Button>
              </form>
            )}
          </>
        }
      />

      {canEdit && isDraft && (
        <Card>
          <p className="mb-3 text-sm font-semibold text-slate-700">Editar roteiro</p>
          <form action={updateGuide.bind(null, id)}>
            <Field>
              <Label>Título</Label>
              <Input name="title" required defaultValue={guide.title} />
            </Field>
            <Field>
              <Label>Objetivo</Label>
              <Textarea name="objective" rows={2} defaultValue={guide.objective ?? ""} />
            </Field>
            <Field>
              <Label>Cenário</Label>
              <Textarea name="scenario" rows={2} defaultValue={guide.scenario ?? ""} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field>
                <Label>JTBD — contexto</Label>
                <Input name="jtbdContext" defaultValue={guide.jtbdContext ?? ""} />
              </Field>
              <Field>
                <Label>JTBD — motivação</Label>
                <Input name="jtbdMotivation" defaultValue={guide.jtbdMotivation ?? ""} />
              </Field>
              <Field>
                <Label>JTBD — obstáculo</Label>
                <Input name="jtbdObstacle" defaultValue={guide.jtbdObstacle ?? ""} />
              </Field>
              <Field>
                <Label>JTBD — resultado esperado</Label>
                <Input name="jtbdExpectedOutcome" defaultValue={guide.jtbdExpectedOutcome ?? ""} />
              </Field>
            </div>
            <Button type="submit" variant="secondary">
              Salvar alterações
            </Button>
          </form>
          <p className="mt-2 text-xs text-slate-500">
            Só é possível editar o roteiro e suas perguntas enquanto ele estiver em rascunho — depois de
            publicar, tudo fica travado (assim entrevistas antigas e novas sempre usam o mesmo roteiro).
          </p>
        </Card>
      )}

      <Card>
        <p className="mb-2 text-sm font-semibold text-slate-700">Roteiro</p>
        {guide.scenario && <p className="mb-2 text-sm text-slate-600">Cenário: {guide.scenario}</p>}

        {isDraft ? (
          <div className="space-y-2">
            {questions.map((q, idx) => (
              <div key={q.id} className="rounded-md border border-slate-100 p-2 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-slate-800">
                    {idx + 1}. {q.questionText}
                    {q.isFollowup && <span className="ml-2 text-xs text-slate-400">(follow-up)</span>}
                  </p>
                  {canEdit && (
                    <form action={deleteGuideQuestion.bind(null, id, q.id)}>
                      <button className="text-xs text-red-500 hover:underline">remover</button>
                    </form>
                  )}
                </div>
                {canEdit && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-indigo-600 hover:underline">
                      editar pergunta
                    </summary>
                    <form action={updateGuideQuestion.bind(null, id, q.id)} className="mt-2 space-y-2">
                      <Field>
                        <Label>Texto da pergunta</Label>
                        <Input name="questionText" required defaultValue={q.questionText} />
                      </Field>
                      <label className="flex items-center gap-2 text-xs text-slate-600">
                        <input type="checkbox" name="isFollowup" value="true" defaultChecked={q.isFollowup} />
                        É uma pergunta de follow-up
                      </label>
                      <Button type="submit" size="sm" variant="secondary">
                        Salvar pergunta
                      </Button>
                    </form>
                  </details>
                )}
              </div>
            ))}

            {canEdit && (
              <form action={addGuideQuestion.bind(null, id)} className="mt-3 space-y-2 rounded-md border border-dashed border-slate-200 p-2">
                <Field>
                  <Label>Nova pergunta</Label>
                  <Input name="questionText" required placeholder="Texto da pergunta" />
                </Field>
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input type="checkbox" name="isFollowup" value="true" />
                  É uma pergunta de follow-up
                </label>
                <Button type="submit" size="sm" variant="secondary">
                  + Adicionar pergunta
                </Button>
              </form>
            )}
          </div>
        ) : (
          <ol className="mt-2 list-inside list-decimal space-y-0.5 text-sm text-slate-700">
            {questions.map((q) => (
              <li key={q.id}>
                {q.questionText}
                {q.isFollowup && <span className="ml-2 text-xs text-slate-400">(follow-up)</span>}
              </li>
            ))}
          </ol>
        )}
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
                  {interviewLabel(iv) || "Entrevistado"} — {new Date(iv.interviewDate).toLocaleDateString("pt-BR")}
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
                <Label>Nome do entrevistado</Label>
                <Input name="intervieweeName" required placeholder="Ex.: Maria Silva" />
              </Field>
              <Field>
                <Label>Nome do laboratório</Label>
                <Input name="intervieweeLab" required placeholder="Ex.: Laboratório Central" />
              </Field>
              <Field>
                <Label>Cargo do entrevistado</Label>
                <Input name="intervieweeRole" required placeholder="Ex.: Recepcionista / Atendente" />
              </Field>
              <Field>
                <Label>Código interno (opcional)</Label>
                <Input name="intervieweeRef" placeholder="Ex.: P07" />
              </Field>
              <Field>
                <Label>Persona</Label>
                <Select name="personaId" defaultValue="">
                  <option value="">—</option>
                  {personaOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.jobTitle ? ` — ${p.jobTitle}` : ""}
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
