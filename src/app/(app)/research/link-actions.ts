"use server";

// Vínculo N:N entre pesquisas (surveys e roteiros de entrevista) e hipóteses.
// Os formulários mandam surveyId/guideId e hypothesisId como campos ocultos
// ou selects, então as duas telas (a da hipótese e a da pesquisa) usam as
// mesmas ações.

import { db } from "@/db";
import {
  hypotheses,
  surveys,
  interviewGuides,
  hypothesisSurveys,
  hypothesisInterviewGuides,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { revalidatePath } from "next/cache";

async function assertSurveyAndHypothesis(projectId: string, surveyId: string, hypothesisId: string) {
  const [[survey], [hyp]] = await Promise.all([
    db.select().from(surveys).where(eq(surveys.id, surveyId)).limit(1),
    db.select().from(hypotheses).where(eq(hypotheses.id, hypothesisId)).limit(1),
  ]);
  if (!survey || survey.projectId !== projectId) throw new Error("Survey não encontrado.");
  if (!hyp || hyp.projectId !== projectId) throw new Error("Hipótese não encontrada.");
}

async function assertGuideAndHypothesis(projectId: string, guideId: string, hypothesisId: string) {
  const [[guide], [hyp]] = await Promise.all([
    db.select().from(interviewGuides).where(eq(interviewGuides.id, guideId)).limit(1),
    db.select().from(hypotheses).where(eq(hypotheses.id, hypothesisId)).limit(1),
  ]);
  if (!guide || guide.projectId !== projectId) throw new Error("Roteiro de entrevista não encontrado.");
  if (!hyp || hyp.projectId !== projectId) throw new Error("Hipótese não encontrada.");
}

function revalidateSurvey(surveyId: string, hypothesisId: string) {
  revalidatePath(`/hypotheses/${hypothesisId}`);
  revalidatePath(`/research/surveys/${surveyId}`);
  revalidatePath("/research/surveys");
}

function revalidateGuide(guideId: string, hypothesisId: string) {
  revalidatePath(`/hypotheses/${hypothesisId}`);
  revalidatePath(`/research/interviews/${guideId}`);
  revalidatePath("/research/interviews");
}

export async function linkSurveyToHypothesis(formData: FormData) {
  const { project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  const surveyId = String(formData.get("surveyId") || "");
  const hypothesisId = String(formData.get("hypothesisId") || "");
  if (!surveyId || !hypothesisId) throw new Error("Selecione a pesquisa e a hipótese.");
  await assertSurveyAndHypothesis(project.id, surveyId, hypothesisId);
  await db.insert(hypothesisSurveys).values({ hypothesisId, surveyId }).onConflictDoNothing();
  revalidateSurvey(surveyId, hypothesisId);
}

export async function unlinkSurveyFromHypothesis(formData: FormData) {
  const { project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  const surveyId = String(formData.get("surveyId") || "");
  const hypothesisId = String(formData.get("hypothesisId") || "");
  await assertSurveyAndHypothesis(project.id, surveyId, hypothesisId);
  await db
    .delete(hypothesisSurveys)
    .where(and(eq(hypothesisSurveys.surveyId, surveyId), eq(hypothesisSurveys.hypothesisId, hypothesisId)));
  revalidateSurvey(surveyId, hypothesisId);
}

export async function linkGuideToHypothesis(formData: FormData) {
  const { project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  const guideId = String(formData.get("guideId") || "");
  const hypothesisId = String(formData.get("hypothesisId") || "");
  if (!guideId || !hypothesisId) throw new Error("Selecione o roteiro e a hipótese.");
  await assertGuideAndHypothesis(project.id, guideId, hypothesisId);
  await db.insert(hypothesisInterviewGuides).values({ hypothesisId, guideId }).onConflictDoNothing();
  revalidateGuide(guideId, hypothesisId);
}

export async function unlinkGuideFromHypothesis(formData: FormData) {
  const { project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  const guideId = String(formData.get("guideId") || "");
  const hypothesisId = String(formData.get("hypothesisId") || "");
  await assertGuideAndHypothesis(project.id, guideId, hypothesisId);
  await db
    .delete(hypothesisInterviewGuides)
    .where(and(eq(hypothesisInterviewGuides.guideId, guideId), eq(hypothesisInterviewGuides.hypothesisId, hypothesisId)));
  revalidateGuide(guideId, hypothesisId);
}
