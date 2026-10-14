"use server";

import { db } from "@/db";
import {
  surveys,
  surveyQuestions,
  surveyResponses,
  surveyAnswers,
  evidence,
  hypothesisEvidence,
  hypothesisSurveys,
  hypotheses,
} from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { hypothesesForSurvey } from "@/lib/research-links";
import { getPageContext } from "@/lib/page-context";
import { checkLeadingQuestion } from "@/lib/bias-check";
import { linesToArray } from "@/lib/list-utils";
import { computeSurveyResults, summarizeSurveyResults } from "@/lib/survey-results";
import { recomputeHypothesis } from "@/lib/recompute-hypothesis";
import { evaluateSurveyAvailability, closeSurveyIfWindowExpired } from "@/lib/survey-window";
import { nanoid } from "nanoid";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

// Usado a partir da tela de Hipótese quando um survey é uma das razões que
// bloqueiam a exclusão (ver checkHypothesisDeletable) — desvincula só ESTA
// hipótese (o survey continua em Research & Testing e nas outras hipóteses
// que ele responde).
export async function unlinkHypothesisFromSurvey(surveyId: string, hypothesisId: string) {
  const { role } = await getPageContext();
  if (role !== "owner" && role !== "editor") throw new Error("Sem permissão.");
  await db
    .delete(hypothesisSurveys)
    .where(and(eq(hypothesisSurveys.surveyId, surveyId), eq(hypothesisSurveys.hypothesisId, hypothesisId)));
  // Coluna antiga (não lida mais pelo app): solta também pra nunca travar a
  // exclusão da hipótese por foreign key.
  await db
    .update(surveys)
    .set({ hypothesisId: null })
    .where(and(eq(surveys.id, surveyId), eq(surveys.hypothesisId, hypothesisId)));
  revalidatePath(`/research/surveys/${surveyId}`);
  revalidatePath(`/hypotheses/${hypothesisId}`);
}

export async function createSurvey(formData: FormData) {
  const { user, project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  const hypothesisId = String(formData.get("hypothesisId") || "") || null;

  const startRaw = String(formData.get("startDate") || "");
  const endRaw = String(formData.get("endDate") || "");
  const startDate = startRaw ? new Date(`${startRaw}T00:00:00`) : null;
  const endDate = endRaw ? new Date(`${endRaw}T23:59:59`) : null;
  if (startDate && endDate && endDate < startDate) {
    throw new Error("A data de término não pode ser antes da data de início.");
  }

  const [created] = await db
    .insert(surveys)
    .values({
      projectId: project.id,
      title: String(formData.get("title") || ""),
      objective: String(formData.get("objective") || ""),
      targetAudience: String(formData.get("targetAudience") || ""),
      sampleTarget: Number(formData.get("sampleTarget") || 30),
      startDate,
      endDate,
      createdBy: user.id,
    })
    .returning();

  if (hypothesisId) {
    const [hyp] = await db.select().from(hypotheses).where(eq(hypotheses.id, hypothesisId)).limit(1);
    if (hyp && hyp.projectId === project.id) {
      await db.insert(hypothesisSurveys).values({ hypothesisId, surveyId: created.id }).onConflictDoNothing();
    }
  }

  revalidatePath("/research/surveys");
  redirect(`/research/surveys/${created.id}`);
}

// Editável em qualquer momento (rascunho, publicado ou já encerrado) — a
// pesquisadora pode querer estender ou adiantar o prazo de coleta mesmo
// depois de publicar. Datas em branco removem o limite correspondente
// (ex.: apagar a data de término faz a pesquisa voltar a só encerrar
// manualmente, via closeSurvey).
export async function updateSurveySchedule(surveyId: string, formData: FormData) {
  const { role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");

  const startRaw = String(formData.get("startDate") || "");
  const endRaw = String(formData.get("endDate") || "");
  const startDate = startRaw ? new Date(`${startRaw}T00:00:00`) : null;
  const endDate = endRaw ? new Date(`${endRaw}T23:59:59`) : null;
  if (startDate && endDate && endDate < startDate) {
    throw new Error("A data de término não pode ser antes da data de início.");
  }

  await db.update(surveys).set({ startDate, endDate }).where(eq(surveys.id, surveyId));
  revalidatePath(`/research/surveys/${surveyId}`);
}

async function assertSurveyIsDraft(surveyId: string) {
  const [survey] = await db.select().from(surveys).where(eq(surveys.id, surveyId)).limit(1);
  if (!survey) throw new Error("Survey não encontrado.");
  if (survey.status !== "draft") {
    throw new Error("Só é possível editar a pesquisa (ou suas perguntas) enquanto ela estiver em rascunho.");
  }
}

// Título/objetivo/público-alvo/meta de amostra — só editável em rascunho.
// Depois de publicar, o link já pode estar circulando com respostas
// chegando, então mudar o objetivo ou a meta silenciosamente deixaria de
// bater com o que os respondentes de fato viram.
export async function updateSurvey(surveyId: string, formData: FormData) {
  const { role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  await assertSurveyIsDraft(surveyId);

  await db
    .update(surveys)
    .set({
      title: String(formData.get("title") || ""),
      objective: String(formData.get("objective") || ""),
      targetAudience: String(formData.get("targetAudience") || ""),
      sampleTarget: Number(formData.get("sampleTarget") || 30),
    })
    .where(eq(surveys.id, surveyId));

  revalidatePath(`/research/surveys/${surveyId}`);
}

export async function addQuestion(surveyId: string, formData: FormData) {
  const { role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  await assertSurveyIsDraft(surveyId);
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
    matrixRows: linesToArray(formData.get("matrixRows")),
    leadingFlag: leading,
    leadingFlagNote: note,
  });
  revalidatePath(`/research/surveys/${surveyId}`);
}

export async function updateQuestion(surveyId: string, questionId: string, formData: FormData) {
  const { role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  await assertSurveyIsDraft(surveyId);

  const questionText = String(formData.get("questionText") || "");
  const { leading, note } = checkLeadingQuestion(questionText);

  await db
    .update(surveyQuestions)
    .set({
      questionText,
      questionType: String(formData.get("questionType") || "open_text") as never,
      options: linesToArray(formData.get("options")),
      matrixRows: linesToArray(formData.get("matrixRows")),
      leadingFlag: leading,
      leadingFlagNote: note,
    })
    .where(eq(surveyQuestions.id, questionId));

  revalidatePath(`/research/surveys/${surveyId}`);
}

export async function deleteQuestion(surveyId: string, questionId: string) {
  const { role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  await assertSurveyIsDraft(surveyId);
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

  // Uma pesquisa pode responder várias hipóteses: a evidência é uma só, mas
  // cada hipótese tem o seu próprio "favorável / contrária".
  let hypothesisId = String(formData.get("hypothesisId") || "");
  if (!hypothesisId) {
    const linked = await hypothesesForSurvey(surveyId);
    if (linked.length === 1) hypothesisId = linked[0].id;
  }
  if (!hypothesisId) throw new Error("Selecione a hipótese para vincular esta evidência.");
  const [targetHyp] = await db.select().from(hypotheses).where(eq(hypotheses.id, hypothesisId)).limit(1);
  if (!targetHyp || targetHyp.projectId !== project.id) throw new Error("Hipótese não encontrada.");

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

  let evidenceId: string;
  if (existing) {
    await db.update(evidence).set(values).where(eq(evidence.id, existing.id));
    evidenceId = existing.id;
  } else {
    const [created] = await db
      .insert(evidence)
      .values({ ...values, projectId: project.id, createdBy: user.id })
      .returning();
    evidenceId = created.id;
  }

  // Só mexe no vínculo da hipótese escolhida — as outras hipóteses que já
  // usam esta evidência mantêm o próprio favorável/contrária.
  await db
    .insert(hypothesisEvidence)
    .values({ hypothesisId, evidenceId, favorable })
    .onConflictDoUpdate({
      target: [hypothesisEvidence.hypothesisId, hypothesisEvidence.evidenceId],
      set: { favorable },
    });
  await db.insert(hypothesisSurveys).values({ hypothesisId, surveyId }).onConflictDoNothing();

  // O conteúdo da evidência pode ter mudado: recalcula todas as hipóteses que a usam.
  const links = await db.select().from(hypothesisEvidence).where(eq(hypothesisEvidence.evidenceId, evidenceId));
  for (const link of links) {
    await recomputeHypothesis(link.hypothesisId, user.id);
    revalidatePath(`/hypotheses/${link.hypothesisId}`);
  }

  revalidatePath(`/research/surveys/${surveyId}`);
  revalidatePath(`/hypotheses/${hypothesisId}`);
  revalidatePath("/repository");
}

// ---------- Resposta pública (sem autenticação) ----------
export async function submitSurveyResponse(slug: string, formData: FormData) {
  const [surveyRow] = await db.select().from(surveys).where(eq(surveys.publicSlug, slug)).limit(1);
  if (!surveyRow) throw new Error("Pesquisa não disponível.");

  // Reavalia a janela de coleta no momento do envio, não só quando a página
  // carregou — evita que alguém envie respostas depois do prazo com uma aba
  // aberta desde antes de a pesquisa encerrar. Se não estiver mais aberta,
  // manda de volta pro link público em vez de estourar um erro cru: a
  // própria página /s/[slug] já sabe mostrar a mensagem certa de
  // indisponível pro motivo atual.
  const survey = await closeSurveyIfWindowExpired(surveyRow);
  if (!evaluateSurveyAvailability(survey).open) {
    redirect(`/s/${slug}`);
  }

  const questions = await db.select().from(surveyQuestions).where(eq(surveyQuestions.surveyId, survey.id));

  const [response] = await db.insert(surveyResponses).values({ surveyId: survey.id }).returning();

  const answerRows = questions
    .map((q) => {
      // Matriz: uma célula por linha×coluna (ver QuestionInput em
      // src/app/s/[slug]/page.tsx) — os inputs vêm nomeados
      // "q_{id}__row_{índice da linha}", cada um podendo ter várias colunas
      // marcadas (checkbox). Guarda como { "linha": ["coluna", ...] }.
      if (q.questionType === "matrix") {
        const rows = (q.matrixRows as string[]) ?? [];
        const value: Record<string, string[]> = {};
        rows.forEach((r, ri) => {
          value[r] = formData.getAll(`q_${q.id}__row_${ri}`).map(String);
        });
        const answered = Object.values(value).some((v) => v.length > 0);
        if (!answered) return null;
        return { responseId: response.id, questionId: q.id, answerValue: value };
      }

      const raw = formData.getAll(`q_${q.id}`);
      if (raw.length === 0) return null;
      const value = q.questionType === "multi_choice" ? raw.map(String) : String(raw[0]);
      return { responseId: response.id, questionId: q.id, answerValue: value };
    })
    .filter(Boolean) as { responseId: string; questionId: string; answerValue: unknown }[];

  if (answerRows.length) await db.insert(surveyAnswers).values(answerRows);

  redirect(`/s/${slug}/obrigado`);
}
