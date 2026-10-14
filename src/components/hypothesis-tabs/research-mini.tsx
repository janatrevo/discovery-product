import Link from "next/link";
import { db } from "@/db";
import { surveys, interviewGuides, surveyResponses } from "@/db/schema";
import { eq, and, inArray, notInArray, sql } from "drizzle-orm";
import { Badge, Button, Card, EmptyState, Select } from "@/components/ui/primitives";
import { surveysForHypothesis, guidesForHypothesis } from "@/lib/research-links";
import {
  linkSurveyToHypothesis,
  unlinkSurveyFromHypothesis,
  linkGuideToHypothesis,
  unlinkGuideFromHypothesis,
} from "@/app/(app)/research/link-actions";

export async function ResearchMiniList({
  hypothesisId,
  projectId,
  role,
}: {
  hypothesisId: string;
  projectId: string;
  role: string;
}) {
  const canEdit = role !== "viewer";
  const [surveyList, guideList] = await Promise.all([
    surveysForHypothesis(hypothesisId),
    guidesForHypothesis(hypothesisId),
  ]);

  // Pesquisas do projeto que ainda NÃO respondem esta hipótese — podem ser
  // vinculadas em vez de criar uma nova (a mesma pesquisa serve a várias
  // hipóteses).
  const surveyIds = surveyList.map((s) => s.id);
  const guideIds = guideList.map((g) => g.id);
  const [availableSurveys, availableGuides, responseCounts] = await Promise.all([
    canEdit
      ? db
          .select()
          .from(surveys)
          .where(
            surveyIds.length
              ? and(eq(surveys.projectId, projectId), notInArray(surveys.id, surveyIds))
              : eq(surveys.projectId, projectId)
          )
      : Promise.resolve([]),
    canEdit
      ? db
          .select()
          .from(interviewGuides)
          .where(
            guideIds.length
              ? and(eq(interviewGuides.projectId, projectId), notInArray(interviewGuides.id, guideIds))
              : eq(interviewGuides.projectId, projectId)
          )
      : Promise.resolve([]),
    surveyIds.length
      ? db
          .select({ surveyId: surveyResponses.surveyId, count: sql<number>`count(*)::int` })
          .from(surveyResponses)
          .where(inArray(surveyResponses.surveyId, surveyIds))
          .groupBy(surveyResponses.surveyId)
      : Promise.resolve([] as { surveyId: string; count: number }[]),
  ]);
  const responsesFor = (id: string) => responseCounts.find((r) => r.surveyId === id)?.count ?? 0;

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">Pesquisa quantitativa (surveys)</p>
          <Link href={`/research/surveys/new?hypothesisId=${hypothesisId}`}>
            <Button size="sm" variant="secondary">
              + Novo survey
            </Button>
          </Link>
        </div>
        {surveyList.length === 0 ? (
          <EmptyState title="Nenhum survey vinculado" />
        ) : (
          <ul className="space-y-1">
            {surveyList.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                <Link href={`/research/surveys/${s.id}`} className="flex min-w-0 flex-1 items-center justify-between gap-2 hover:underline">
                  <span className="truncate">{s.title}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-slate-400">{responsesFor(s.id)} resposta(s)</span>
                    <Badge>{s.status}</Badge>
                  </span>
                </Link>
                {canEdit && (
                  <form action={unlinkSurveyFromHypothesis}>
                    <input type="hidden" name="surveyId" value={s.id} />
                    <input type="hidden" name="hypothesisId" value={hypothesisId} />
                    <button type="submit" className="text-xs text-red-500 hover:underline">
                      desvincular
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && availableSurveys.length > 0 && (
          <form action={linkSurveyToHypothesis} className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
            <input type="hidden" name="hypothesisId" value={hypothesisId} />
            <Select name="surveyId" defaultValue="" required className="max-w-md">
              <option value="">Vincular survey que já existe...</option>
              {availableSurveys.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </Select>
            <Button type="submit" size="sm" variant="secondary">
              Vincular
            </Button>
          </form>
        )}
      </Card>

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">Pesquisa qualitativa (entrevistas)</p>
          <Link href={`/research/interviews/new?hypothesisId=${hypothesisId}`}>
            <Button size="sm" variant="secondary">
              + Novo roteiro
            </Button>
          </Link>
        </div>
        {guideList.length === 0 ? (
          <EmptyState title="Nenhum roteiro de entrevista vinculado" />
        ) : (
          <ul className="space-y-1">
            {guideList.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-2 text-sm">
                <Link href={`/research/interviews/${g.id}`} className="min-w-0 flex-1 truncate hover:underline">
                  {g.title}
                </Link>
                {canEdit && (
                  <form action={unlinkGuideFromHypothesis}>
                    <input type="hidden" name="guideId" value={g.id} />
                    <input type="hidden" name="hypothesisId" value={hypothesisId} />
                    <button type="submit" className="text-xs text-red-500 hover:underline">
                      desvincular
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && availableGuides.length > 0 && (
          <form action={linkGuideToHypothesis} className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
            <input type="hidden" name="hypothesisId" value={hypothesisId} />
            <Select name="guideId" defaultValue="" required className="max-w-md">
              <option value="">Vincular roteiro que já existe...</option>
              {availableGuides.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </Select>
            <Button type="submit" size="sm" variant="secondary">
              Vincular
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
