import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import {
  experiments,
  hypotheses,
  surveys,
  interviewGuides,
  surveyResponses,
  interviews,
  experimentSurveys,
  experimentInterviewGuides,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { Badge, Button, Card, Field, Input, Label, PageHeader, Select, Textarea } from "@/components/ui/primitives";
import {
  lockSuccessCriteria,
  recordResult,
  linkResearchToExperiment,
  unlinkResearchFromExperiment,
} from "../actions";

export default async function ExperimentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project, role } = await getPageContext();
  const [exp] = await db.select().from(experiments).where(eq(experiments.id, id)).limit(1);
  if (!exp || exp.projectId !== project.id) notFound();

  const [hyp] = await db.select().from(hypotheses).where(eq(hypotheses.id, exp.hypothesisId)).limit(1);
  const canEdit = role !== "viewer";

  // Pesquisas (surveys e roteiros de entrevista) usadas neste experimento.
  const [linkedSurveys, linkedGuides, allSurveys, allGuides] = await Promise.all([
    db
      .select({
        id: surveys.id,
        title: surveys.title,
        status: surveys.status,
        responses: sql<number>`(select count(*)::int from ${surveyResponses} where ${surveyResponses.surveyId} = ${surveys.id})`,
      })
      .from(experimentSurveys)
      .innerJoin(surveys, eq(surveys.id, experimentSurveys.surveyId))
      .where(eq(experimentSurveys.experimentId, id)),
    db
      .select({
        id: interviewGuides.id,
        title: interviewGuides.title,
        interviews: sql<number>`(select count(*)::int from ${interviews} where ${interviews.guideId} = ${interviewGuides.id})`,
      })
      .from(experimentInterviewGuides)
      .innerJoin(interviewGuides, eq(interviewGuides.id, experimentInterviewGuides.guideId))
      .where(eq(experimentInterviewGuides.experimentId, id)),
    db.select({ id: surveys.id, title: surveys.title }).from(surveys).where(eq(surveys.projectId, project.id)),
    db
      .select({ id: interviewGuides.id, title: interviewGuides.title })
      .from(interviewGuides)
      .where(eq(interviewGuides.projectId, project.id)),
  ]);
  const linkedSurveyIds = new Set(linkedSurveys.map((x) => x.id));
  const linkedGuideIds = new Set(linkedGuides.map((x) => x.id));
  const availableSurveys = allSurveys.filter((x) => !linkedSurveyIds.has(x.id));
  const availableGuides = allGuides.filter((x) => !linkedGuideIds.has(x.id));
  const showResearch =
    exp.method === "survey" ||
    exp.method === "interview" ||
    linkedSurveys.length > 0 ||
    linkedGuides.length > 0;

  return (
    <div className="max-w-2xl space-y-4">
      <PageHeader
        title={`Experimento — ${exp.method}`}
        description={hyp ? `Hipótese: ${hyp.title}` : undefined}
        actions={<Badge>{exp.status}</Badge>}
      />

      <Card className="space-y-2 text-sm text-slate-700">
        {exp.objective && <p><strong>Objetivo:</strong> {exp.objective}</p>}
        {exp.variable && <p><strong>Variável:</strong> {exp.variable}</p>}
        {exp.metric && <p><strong>Métrica:</strong> {exp.metric}</p>}
        {exp.samplePlanned && <p><strong>Amostra planejada:</strong> {exp.samplePlanned}</p>}
        {exp.resultExpected && <p><strong>Resultado esperado:</strong> {exp.resultExpected}</p>}
      </Card>

      {showResearch && (
        <Card>
          <p className="mb-1 text-sm font-semibold text-slate-700">Pesquisas usadas neste experimento</p>
          <p className="mb-2 text-xs text-slate-500">
            Surveys e roteiros de entrevista que já existem. Ao vincular aqui, a pesquisa também passa a responder a
            hipótese deste experimento.
          </p>

          {linkedSurveys.length === 0 && linkedGuides.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhuma pesquisa vinculada ainda.</p>
          ) : (
            <ul className="space-y-1">
              {linkedSurveys.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    <Link href={`/research/surveys/${x.id}`} className="text-indigo-700 hover:underline">
                      {x.title}
                    </Link>
                    <span className="ml-2 text-xs text-slate-400">
                      survey · {x.status} · {x.responses} resposta(s)
                    </span>
                  </span>
                  {canEdit && (
                    <form action={unlinkResearchFromExperiment}>
                      <input type="hidden" name="experimentId" value={id} />
                      <input type="hidden" name="surveyId" value={x.id} />
                      <button type="submit" className="text-xs text-red-500 hover:underline">
                        remover
                      </button>
                    </form>
                  )}
                </li>
              ))}
              {linkedGuides.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    <Link href={`/research/interviews/${x.id}`} className="text-indigo-700 hover:underline">
                      {x.title}
                    </Link>
                    <span className="ml-2 text-xs text-slate-400">entrevista · {x.interviews} realizada(s)</span>
                  </span>
                  {canEdit && (
                    <form action={unlinkResearchFromExperiment}>
                      <input type="hidden" name="experimentId" value={id} />
                      <input type="hidden" name="guideId" value={x.id} />
                      <button type="submit" className="text-xs text-red-500 hover:underline">
                        remover
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canEdit && availableSurveys.length > 0 && (
            <form action={linkResearchToExperiment} className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
              <input type="hidden" name="experimentId" value={id} />
              <Select name="surveyId" defaultValue="" required className="max-w-md">
                <option value="">Adicionar survey que já existe...</option>
                {availableSurveys.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.title}
                  </option>
                ))}
              </Select>
              <Button type="submit" size="sm" variant="secondary">
                Adicionar
              </Button>
            </form>
          )}
          {canEdit && availableGuides.length > 0 && (
            <form action={linkResearchToExperiment} className="mt-2 flex flex-wrap items-center gap-2">
              <input type="hidden" name="experimentId" value={id} />
              <Select name="guideId" defaultValue="" required className="max-w-md">
                <option value="">Adicionar roteiro de entrevista que já existe...</option>
                {availableGuides.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.title}
                  </option>
                ))}
              </Select>
              <Button type="submit" size="sm" variant="secondary">
                Adicionar
              </Button>
            </form>
          )}
        </Card>
      )}

      {!exp.successCriteriaLockedAt ? (
        canEdit && (
          <Card>
            <p className="mb-2 text-sm font-semibold text-slate-700">
              Definir e travar critério de sucesso (antes de qualquer resultado)
            </p>
            <form action={lockSuccessCriteria.bind(null, id)}>
              <Field>
                <Label>Critério de sucesso</Label>
                <Textarea name="successCriteria" rows={2} required placeholder="Ex.: ≥70% dos participantes completam a tarefa sem ajuda" />
              </Field>
              <Button type="submit">Travar critério e iniciar experimento</Button>
            </form>
          </Card>
        )
      ) : (
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Critério de sucesso (travado em {new Date(exp.successCriteriaLockedAt).toLocaleString("pt-BR")})
          </p>
          <p className="text-sm text-slate-700">{exp.successCriteria}</p>
        </Card>
      )}

      {exp.successCriteriaLockedAt && !exp.resultRecordedAt && canEdit && (
        <Card>
          <p className="mb-2 text-sm font-semibold text-slate-700">Registrar resultado</p>
          <form action={recordResult.bind(null, id)} className="space-y-2">
            <Field>
              <Label>Amostra obtida</Label>
              <Input name="sampleActual" type="number" />
            </Field>
            <Field>
              <Label>Resultado observado</Label>
              <Textarea name="resultObserved" rows={3} required />
            </Field>
            <Field>
              <Label>Conclusão</Label>
              <Textarea name="conclusion" rows={2} required />
            </Field>
            <Field>
              <Label>Próximo passo</Label>
              <Input name="nextStep" />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" name="createEvidence" value="true" defaultChecked /> Registrar como evidência
              vinculada à hipótese
            </label>
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600">Favorável à hipótese?</label>
              <select name="favorable" defaultValue="true" className="rounded-md border border-slate-300 px-2 py-1 text-sm">
                <option value="true">Sim</option>
                <option value="false">Não (contrária)</option>
              </select>
            </div>
            <Button type="submit">Registrar resultado</Button>
          </form>
        </Card>
      )}

      {exp.resultRecordedAt && (
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Resultado (registrado em {new Date(exp.resultRecordedAt).toLocaleString("pt-BR")})</p>
          <p className="text-sm text-slate-700">{exp.resultObserved}</p>
          <p className="mt-2 text-sm text-slate-700"><strong>Conclusão:</strong> {exp.conclusion}</p>
          {exp.nextStep && <p className="mt-1 text-sm text-slate-700"><strong>Próximo passo:</strong> {exp.nextStep}</p>}
        </Card>
      )}

      {hyp && (
        <Link href={`/hypotheses/${hyp.id}`} className="text-sm font-medium text-indigo-600">
          ← Voltar para a hipótese
        </Link>
      )}
    </div>
  );
}
