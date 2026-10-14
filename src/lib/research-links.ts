// Consultas dos vínculos pesquisa <-> hipótese (N:N). Uma mesma pesquisa
// (survey ou roteiro de entrevista) pode responder várias hipóteses — ver
// hypothesisSurveys / hypothesisInterviewGuides em src/db/schema.ts.
import { db } from "@/db";
import {
  hypotheses,
  surveys,
  interviewGuides,
  hypothesisSurveys,
  hypothesisInterviewGuides,
} from "@/db/schema";
import { eq, desc, inArray } from "drizzle-orm";

export type HypothesisRef = { id: string; title: string };

export async function surveysForHypothesis(hypothesisId: string) {
  const rows = await db
    .select({ survey: surveys })
    .from(hypothesisSurveys)
    .innerJoin(surveys, eq(surveys.id, hypothesisSurveys.surveyId))
    .where(eq(hypothesisSurveys.hypothesisId, hypothesisId))
    .orderBy(desc(surveys.createdAt));
  return rows.map((r) => r.survey);
}

export async function guidesForHypothesis(hypothesisId: string) {
  const rows = await db
    .select({ guide: interviewGuides })
    .from(hypothesisInterviewGuides)
    .innerJoin(interviewGuides, eq(interviewGuides.id, hypothesisInterviewGuides.guideId))
    .where(eq(hypothesisInterviewGuides.hypothesisId, hypothesisId))
    .orderBy(desc(interviewGuides.createdAt));
  return rows.map((r) => r.guide);
}

export async function hypothesesForSurvey(surveyId: string): Promise<HypothesisRef[]> {
  const rows = await db
    .select({ id: hypotheses.id, title: hypotheses.title })
    .from(hypothesisSurveys)
    .innerJoin(hypotheses, eq(hypotheses.id, hypothesisSurveys.hypothesisId))
    .where(eq(hypothesisSurveys.surveyId, surveyId));
  return rows;
}

export async function hypothesesForGuide(guideId: string): Promise<HypothesisRef[]> {
  const rows = await db
    .select({ id: hypotheses.id, title: hypotheses.title })
    .from(hypothesisInterviewGuides)
    .innerJoin(hypotheses, eq(hypotheses.id, hypothesisInterviewGuides.hypothesisId))
    .where(eq(hypothesisInterviewGuides.guideId, guideId));
  return rows;
}

// Para listagens: hipóteses de várias pesquisas de uma vez (evita N consultas).
export async function hypothesesBySurveyIds(surveyIds: string[]): Promise<Map<string, HypothesisRef[]>> {
  const map = new Map<string, HypothesisRef[]>();
  if (surveyIds.length === 0) return map;
  const rows = await db
    .select({ surveyId: hypothesisSurveys.surveyId, id: hypotheses.id, title: hypotheses.title })
    .from(hypothesisSurveys)
    .innerJoin(hypotheses, eq(hypotheses.id, hypothesisSurveys.hypothesisId))
    .where(inArray(hypothesisSurveys.surveyId, surveyIds));
  for (const r of rows) {
    const list = map.get(r.surveyId) ?? [];
    list.push({ id: r.id, title: r.title });
    map.set(r.surveyId, list);
  }
  return map;
}

export async function hypothesesByGuideIds(guideIds: string[]): Promise<Map<string, HypothesisRef[]>> {
  const map = new Map<string, HypothesisRef[]>();
  if (guideIds.length === 0) return map;
  const rows = await db
    .select({ guideId: hypothesisInterviewGuides.guideId, id: hypotheses.id, title: hypotheses.title })
    .from(hypothesisInterviewGuides)
    .innerJoin(hypotheses, eq(hypotheses.id, hypothesisInterviewGuides.hypothesisId))
    .where(inArray(hypothesisInterviewGuides.guideId, guideIds));
  for (const r of rows) {
    const list = map.get(r.guideId) ?? [];
    list.push({ id: r.id, title: r.title });
    map.set(r.guideId, list);
  }
  return map;
}
