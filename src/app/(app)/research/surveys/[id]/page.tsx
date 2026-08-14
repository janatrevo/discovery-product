import { notFound } from "next/navigation";
import { db } from "@/db";
import { surveys, surveyQuestions, surveyResponses, hypotheses, evidence } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { computeSurveyResults } from "@/lib/survey-results";
import { Badge, Button, Card, Field, Input, Label, PageHeader, Select, Textarea } from "@/components/ui/primitives";
import { addQuestion, deleteQuestion, publishSurvey, closeSurvey, promoteSurveyToEvidence } from "../actions";

const QUESTION_TYPES = [
  { value: "likert", label: "Likert (1-5)" },
  { value: "single_choice", label: "Escolha única" },
  { value: "multi_choice", label: "Múltipla escolha" },
  { value: "ranking", label: "Ranking" },
  { value: "matrix", label: "Matriz" },
  { value: "nps", label: "NPS (0-10)" },
  { value: "purchase_intent", label: "Intenção de compra (1-5)" },
  { value: "frequency", label: "Frequência" },
  { value: "demographic", label: "Demográfica" },
  { value: "open_text", label: "Texto aberto" },
];

export default async function SurveyBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project, role } = await getPageContext();
  const [survey] = await db.select().from(surveys).where(eq(surveys.id, id)).limit(1);
  if (!survey || survey.projectId !== project.id) notFound();

  const questions = await db
    .select()
    .from(surveyQuestions)
    .where(eq(surveyQuestions.surveyId, id))
    .orderBy(surveyQuestions.orderIndex);

  const [{ count: responseCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(surveyResponses)
    .where(eq(surveyResponses.surveyId, id));

  const canEdit = role !== "viewer";
  const publicUrl = survey.publicSlug ? `/s/${survey.publicSlug}` : null;
  const results = survey.status !== "draft" ? await computeSurveyResults(id) : [];

  const [hypothesisList, promotedEvidenceRows] = await Promise.all([
    db.select().from(hypotheses).where(eq(hypotheses.projectId, project.id)),
    db.select().from(evidence).where(eq(evidence.sourceSurveyId, id)).limit(1),
  ]);
  const promotedEvidence = promotedEvidenceRows[0];

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader
        title={survey.title}
        description={survey.objective ?? undefined}
        actions={
          <>
            <Badge color={survey.status === "published" ? "emerald" : survey.status === "closed" ? "slate" : "amber"}>
              {survey.status}
            </Badge>
            {canEdit && survey.status === "draft" && questions.length > 0 && (
              <form action={publishSurvey.bind(null, id)}>
                <Button type="submit">Publicar</Button>
              </form>
            )}
            {canEdit && survey.status === "published" && (
              <form action={closeSurvey.bind(null, id)}>
                <Button type="submit" variant="secondary">
                  Encerrar coleta
                </Button>
              </form>
            )}
          </>
        }
      />

      {publicUrl && (
        <Card className="bg-indigo-50">
          <p className="text-sm text-slate-700">
            Link público para coleta:{" "}
            <code className="rounded bg-white px-1.5 py-0.5 text-xs">{publicUrl}</code>
          </p>
          <p className="mt-1 text-xs text-slate-500">{responseCount} resposta(s) até agora · meta: {survey.sampleTarget}</p>
        </Card>
      )}

      <Card>
        <p className="mb-3 text-sm font-semibold text-slate-700">Perguntas ({questions.length})</p>
        <ul className="mb-4 space-y-2">
          {questions.map((q, idx) => (
            <li key={q.id} className="rounded-md border border-slate-100 p-2 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-800">
                    {idx + 1}. {q.questionText}
                  </p>
                  <p className="text-xs text-slate-400">{q.questionType}</p>
                  {(q.options as string[])?.length > 0 && (
                    <p className="text-xs text-slate-500">Opções: {(q.options as string[]).join(", ")}</p>
                  )}
                </div>
                {canEdit && survey.status === "draft" && (
                  <form action={deleteQuestion.bind(null, id, q.id)}>
                    <button className="text-xs text-red-500 hover:underline">remover</button>
                  </form>
                )}
              </div>
              {q.leadingFlag && (
                <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                  ⚠ Possível leading question: {q.leadingFlagNote}
                </p>
              )}
            </li>
          ))}
        </ul>

        {canEdit && survey.status === "draft" && (
          <form action={addQuestion.bind(null, id)} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field>
                <Label>Texto da pergunta</Label>
                <Input name="questionText" required />
              </Field>
            </div>
            <Field>
              <Label>Tipo</Label>
              <Select name="questionType" defaultValue="likert">
                {QUESTION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field>
              <Label>Opções (uma por linha, se aplicável)</Label>
              <Textarea name="options" rows={2} />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" variant="secondary">
                + Adicionar pergunta
              </Button>
            </div>
          </form>
        )}
      </Card>

      {survey.status !== "draft" && (
        <Card>
          <p className="mb-3 text-sm font-semibold text-slate-700">Resultados ({responseCount} respostas)</p>
          {results.length === 0 ? (
            <p className="text-sm text-slate-400">Sem perguntas.</p>
          ) : (
            <div className="space-y-4">
              {results.map((r) => (
                <div key={r.question.id}>
                  <p className="text-sm font-medium text-slate-700">{r.question.questionText}</p>
                  <p className="text-xs text-slate-400">n = {r.n}</p>
                  {r.type === "counts" && (
                    <ul className="mt-1 space-y-0.5 text-sm">
                      {Object.entries(r.counts).map(([k, v]) => (
                        <li key={k} className="flex items-center gap-2">
                          <span className="w-32 truncate text-slate-600">{k}</span>
                          <div className="h-2 flex-1 rounded bg-slate-100">
                            <div
                              className="h-2 rounded bg-indigo-500"
                              style={{ width: `${r.n ? (v / r.n) * 100 : 0}%` }}
                            />
                          </div>
                          <span className="text-xs text-slate-500">{v}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {r.type === "average" && (
                    <p className="mt-1 text-lg font-semibold text-slate-800">
                      {r.average != null ? r.average.toFixed(1) : "—"}
                    </p>
                  )}
                  {r.type === "text" && (
                    <ul className="mt-1 list-inside list-disc text-sm text-slate-600">
                      {r.texts.slice(0, 10).map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}

          {canEdit && responseCount > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <p className="mb-1 text-sm font-semibold text-slate-700">Promover para Evidência real</p>
              <p className="mb-2 text-xs text-slate-500">
                Envia este resumo para o Research Repository e para o Confidence Score da hipótese —
                sem isso, os resultados deste survey não contam para a confiança calculada de nenhuma
                hipótese.
              </p>
              {promotedEvidence && (
                <p className="mb-2 text-xs text-emerald-700">
                  ✓ Já promovido — última atualização{" "}
                  {new Date(promotedEvidence.createdAt).toLocaleDateString("pt-BR")}. Promover de novo
                  atualiza o conteúdo.
                </p>
              )}
              <form action={promoteSurveyToEvidence.bind(null, id)} className="flex flex-wrap items-end gap-2">
                {!survey.hypothesisId && (
                  <Select name="hypothesisId" defaultValue="" className="max-w-xs">
                    <option value="">Selecione a hipótese...</option>
                    {hypothesisList.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.title}
                      </option>
                    ))}
                  </Select>
                )}
                <Select name="favorable" className="w-40" defaultValue="true">
                  <option value="true">Favorável</option>
                  <option value="false">Contrária</option>
                </Select>
                <Button type="submit" size="sm" variant="secondary">
                  {promotedEvidence ? "Atualizar evidência" : "Promover para evidência"}
                </Button>
              </form>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
