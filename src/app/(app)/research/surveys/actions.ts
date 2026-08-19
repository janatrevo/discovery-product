"use server";

import { db } from "@/db";
import { surveys, surveyQuestions, surveyResponses, surveyAnswers, evidence, hypothesisEvidence } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { checkLeadingQuestion } from "@/lib/bias-check";
import { linesToArray } from "@/lib/list-utils";
import { computeSurveyResults, summarizeSurveyResults } from "@/lib/survey-results";
import { recomputeHypothesis } from "@/lib/recompute-hypothesis";
import { nanoid } from "nanoid";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

// Usado a partir da tela de Hipótese quando um survey é uma das razões que
// bloqueiam a exclusão (ver checkHypothesisDeletable) — desvincula sem
// apagar o survey (ele continua em Research & Testing, só solta a
// hipótese).
export async function unlinkHypothesisFromSurvey(surveyId: string, hypothesisId: string) {
  const { role } = await getPageContext();
  if (role !== "owner" && role !== "editor") throw new Error("Sem permissão.");
  await db.update(surveys).set({ hypothesisId: null }).where(eq(surveys.id, surveyId));
  revalidatePath(`/research/surveys/${surveyId}`);
  revalidatePath(`/hypotheses/${hypothesisId}`);
}

export async function createSurvey(formData: FormData) {
  const { user, project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  const hypothesisId = String(formData.get("hypothesisId") || "") || null;

  const [created] = await db
    .insert(surveys)
    .values({
      projectId: project.id,
      hypothesisId,
      title: String(formData.get("title") || ""),
      objective: String(formData.get("objective") || ""),
      targetAudience: String(formData.get("targetAudience") || ""),
      sampleTarget: Number(formData.get("sampleTarget") || 30),
      createdBy: user.id,
    })
    .returning();

  revalidatePath("/research/surveys");
  redirect(`/research/surveys/${created.id}`);
}

export async function addQuestion(surveyId: string, formData: FormData) {
  const { role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  const questionText = String(formData.get("questionText") || "");
  const { leading, note } = checkLeadingQuestion(questionText);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(surveyQuestions)
    .where(eq(surveyQuestions.surveyId, surveyId));

  await db.insert(surveyQuestions).values({
    surveyId,
    orderIndex: count ?? 0,
    questionText,
    questionType: String(formData.get("questionType") || "open_text") as never,
    options: linesToArray(formData.get("options")),
    leadingFlag: leading,
    leadingFlagNote: note,
  });
  revalidatePath(`/research/surveys/${surveyId}`);
}

export async function deleteQuestion(surveyId: string, questionId: string) {
  const { role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  await db.delete(surveyQuestions).where(eq(surveyQuestions.id, questionId));
  revalidatePath(`/research/surveys/${surveyId}`);
}

export async function publishSurvey(surveyId: string) {
  const { role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  const slug = nanoid(10);
  await db.update(surveys).set({ status: "published", publicSlug: slug }).where(eq(surveys.id, surveyId));
  revalidatePath(`/research/surveys/${surveyId}`);
}

export async function closeSurvey(surveyId: string) {
  const { role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  await db.update(surveys).set({ status: "closed" }).where(eq(surveys.id, surveyId));
  revalidatePath(`/research/surveys/${surveyId}`);
}

// Promove os resultados agregados de um survey a uma Evidência real,
// vinculada a uma hipótese — sem isso, um survey respondido nunca contava
// para o Confidence Score (era preciso digitar tudo de novo manualmente no
// formulário de Evidência). Idempotente: promover de novo atualiza o
// conteúdo em vez de duplicar (rastreado por evidence.sourceSurveyId).
export async function promoteSurveyToEvidence(surveyId: string, formData: FormData) {
  const { user, project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");

  const [survey] = await db.select().from(surveys).where(eq(surveys.id, surveyId)).limit(1);
  if (!survey || survey.projectId !== project.id) throw new Error("Survey não encontrado.");

  const [{ count: responseCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(surveyResponses)
    .where(eq(surveyResponses.surveyId, surveyId));
  if (!responseCount) throw new Error("Este survey ainda não tem respostas — nada para promover a evidência.");

  const hypothesisId = String(formData.get("hypothesisId") || survey.hypothesisId || "");
  if (!hypothesisId) throw new Error("Selecione uma hipótese para vincular esta evidência.");

  const favorable = formData.get("favorable") === "true";

  const questions = await db.select().from(surveyQuestions).where(eq(surveyQuestions.surveyId, surveyId));
  const hasLeadingQuestion = questions.some((q) => q.leadingFlag);

  const results = await computeSurveyResults(surveyId);
  const content = `Resumo automático do survey "${survey.title}" (${responseCount} resposta(s)):\n${summarizeSurveyResults(results)}`;

  const values = {
    source: `Survey: ${survey.title}`,
    type: "survey",
    content,
    sampleSize: responseCount,
    qualityScore: hasLeadingQuestion ? 55 : 75,
    reliabilityScore: 70,
    originClass: "real_data" as const,
    originMethod: "survey",
    generatedBy: "human" as const,
    sourceSurveyId: surveyId,
    evidenceDate: new Date(),
  };

  const [existing] = await db.select().from(evidence).where(eq(evidence.sourceSurveyId, surveyId)).limit(1);

  if (existing) {
    await db.update(evidence).set(values).where(eq(evidence.id, existing.id));
    const existingLinks = await db
      .select()
      .from(hypothesisEvidence)
      .where(eq(hypothesisEvidence.evidenceId, existing.id));
    if (existingLinks.length) {
      await db.update(hypothesisEvidence).set({ favorable }).where(eq(hypothesisEvidence.evidenceId, existing.id));
      for (const link of existingLinks) await recomputeHypothesis(link.hypothesisId, user.id);
    } else {
      await db.insert(hypothesisEvidence).values({ hypothesisId, evidenceId: existing.id, favorable });
      await recomputeHypothesis(hypothesisId, user.id);
    }
  } else {
    const [created] = await db
      .insert(evidence)
      .values({ ...values, projectId: project.id, createdBy: user.id })
      .returning();
    await db.insert(hypothesisEvidence).values({ hypothesisId, evidenceId: created.id, favorable });
    await recomputeHypothesis(hypothesisId, user.id);
  }

  revalidatePath(`/research/surveys/${surveyId}`);
  revalidatePath(`/hypotheses/${hypothesisId}`);
  revalidatePath("/repository");
}

// ---------- Resposta pública (sem autenticação) ----------
export async function submitSurveyResponse(slug: string, formData: FormData) {
  const [survey] = await db.select().from(surveys).where(eq(surveys.publicSlug, slug)).limit(1);
  if (!survey || survey.status !== "published") throw new Error("Pesquisa não disponível.");

  const questions = await db.select().from(surveyQuestions).where(eq(surveyQuestions.surveyId, survey.id));

  const [response] = await db.insert(surveyResponses).values({ surveyId: survey.id }).returning();

  const answerRows = questions
    .map((q) => {
      const raw = formData.getAll(`q_${q.id}`);
      if (raw.length === 0) return null;
      const value = q.questionType === "multi_choice" ? raw.map(String) : String(raw[0]);
      return { responseId: response.id, questionId: q.id, answerValue: value };
    })
    .filter(Boolean) as { responseId: string; questionId: string; answerValue: unknown }[];

  if (answerRows.length) await db.insert(surveyAnswers).values(answerRows);

  redirect(`/s/${slug}/obrigado`);
}
