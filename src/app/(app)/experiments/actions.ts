"use server";

import { db } from "@/db";
import {
  experiments,
  evidence,
  hypothesisEvidence,
  surveys,
  interviewGuides,
  experimentSurveys,
  experimentInterviewGuides,
  hypothesisSurveys,
  hypothesisInterviewGuides,
} from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { recomputeHypothesis } from "@/lib/recompute-hypothesis";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

// Usado a partir da tela de Persona (ver checkPersonaDeletable em
// src/lib/delete-guards.ts) quando um experimento é uma das razões que
// bloqueiam a exclusão da persona — desvincula sem apagar o experimento em
// si (personaId é opcional aqui, então isso não perde nenhum dado do
// experimento, só solta a referência).
export async function unlinkPersonaFromExperiment(experimentId: string, personaId: string) {
  const { role } = await getPageContext();
  if (role !== "owner" && role !== "editor") throw new Error("Sem permissão.");
  await db.update(experiments).set({ personaId: null }).where(eq(experiments.id, experimentId));
  revalidatePath(`/experiments/${experimentId}`);
  revalidatePath(`/personas/${personaId}`);
}

// Usado a partir da tela de Hipótese quando um experimento é uma das razões
// que bloqueiam a exclusão (ver checkHypothesisDeletable) — diferente de
// persona/oportunidade, experiments.hypothesisId é obrigatório (NOT NULL,
// ver src/db/schema.ts), então não dá pra "desvincular": a única forma de
// liberar a exclusão da hipótese é excluir o experimento inteiro. Nenhuma
// outra tabela referencia experiments.id via foreign key, então isso é
// seguro (não deixa nada órfão).
export async function deleteExperiment(experimentId: string, redirectTo?: string) {
  const { role } = await getPageContext();
  if (role !== "owner" && role !== "editor") throw new Error("Sem permissão para excluir experimentos.");
  const [exp] = await db.select().from(experiments).where(eq(experiments.id, experimentId)).limit(1);
  if (!exp) throw new Error("Experimento não encontrado.");
  await db.delete(experiments).where(eq(experiments.id, experimentId));
  revalidatePath(`/hypotheses/${exp.hypothesisId}`);
  revalidatePath(`/hypotheses/${exp.hypothesisId}`, "layout");
  if (redirectTo) redirect(redirectTo);
}

// Vincula pesquisas que JÁ EXISTEM ao experimento (e à hipótese dele) — em
// vez de criar uma pesquisa nova. Só aceita ids do próprio projeto.
async function attachResearchToExperiment(
  projectId: string,
  experimentId: string,
  hypothesisId: string,
  surveyIds: string[],
  guideIds: string[]
) {
  if (surveyIds.length) {
    const valid = await db
      .select({ id: surveys.id })
      .from(surveys)
      .where(and(eq(surveys.projectId, projectId), inArray(surveys.id, surveyIds)));
    if (valid.length) {
      await db
        .insert(experimentSurveys)
        .values(valid.map((v) => ({ experimentId, surveyId: v.id })))
        .onConflictDoNothing();
      await db
        .insert(hypothesisSurveys)
        .values(valid.map((v) => ({ hypothesisId, surveyId: v.id })))
        .onConflictDoNothing();
    }
  }
  if (guideIds.length) {
    const valid = await db
      .select({ id: interviewGuides.id })
      .from(interviewGuides)
      .where(and(eq(interviewGuides.projectId, projectId), inArray(interviewGuides.id, guideIds)));
    if (valid.length) {
      await db
        .insert(experimentInterviewGuides)
        .values(valid.map((v) => ({ experimentId, guideId: v.id })))
        .onConflictDoNothing();
      await db
        .insert(hypothesisInterviewGuides)
        .values(valid.map((v) => ({ hypothesisId, guideId: v.id })))
        .onConflictDoNothing();
    }
  }
}

export async function createExperiment(hypothesisId: string, formData: FormData) {
  const { user, project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");

  const method = String(formData.get("method") || "interview");
  // Pesquisas já existentes só valem para o método correspondente.
  const surveyIds = method === "survey" ? formData.getAll("surveyIds").map(String).filter(Boolean) : [];
  const guideIds = method === "interview" ? formData.getAll("guideIds").map(String).filter(Boolean) : [];

  const [created] = await db
    .insert(experiments)
    .values({
      projectId: project.id,
      hypothesisId,
      objective: String(formData.get("objective") || ""),
      personaId: String(formData.get("personaId") || "") || null,
      variable: String(formData.get("variable") || ""),
      method: method as never,
      metric: String(formData.get("metric") || ""),
      samplePlanned: Number(formData.get("samplePlanned") || 0) || null,
      resultExpected: String(formData.get("resultExpected") || ""),
      createdBy: user.id,
    })
    .returning();

  await attachResearchToExperiment(project.id, created.id, hypothesisId, surveyIds, guideIds);

  revalidatePath(`/hypotheses/${hypothesisId}`);
  redirect(`/experiments/${created.id}`);
}

// Adiciona uma pesquisa existente a um experimento que já foi criado.
export async function linkResearchToExperiment(formData: FormData) {
  const { project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  const experimentId = String(formData.get("experimentId") || "");
  const surveyId = String(formData.get("surveyId") || "");
  const guideId = String(formData.get("guideId") || "");
  if (!surveyId && !guideId) throw new Error("Selecione a pesquisa.");
  const [exp] = await db.select().from(experiments).where(eq(experiments.id, experimentId)).limit(1);
  if (!exp || exp.projectId !== project.id) throw new Error("Experimento não encontrado.");
  await attachResearchToExperiment(
    project.id,
    experimentId,
    exp.hypothesisId,
    surveyId ? [surveyId] : [],
    guideId ? [guideId] : []
  );
  revalidatePath(`/experiments/${experimentId}`);
  revalidatePath(`/hypotheses/${exp.hypothesisId}`);
}

// Tira a pesquisa SÓ do experimento — ela continua vinculada à hipótese (se
// quiser soltar de lá também, é na aba "Pesquisa" da hipótese).
export async function unlinkResearchFromExperiment(formData: FormData) {
  const { project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  const experimentId = String(formData.get("experimentId") || "");
  const surveyId = String(formData.get("surveyId") || "");
  const guideId = String(formData.get("guideId") || "");
  const [exp] = await db.select().from(experiments).where(eq(experiments.id, experimentId)).limit(1);
  if (!exp || exp.projectId !== project.id) throw new Error("Experimento não encontrado.");
  if (surveyId) {
    await db
      .delete(experimentSurveys)
      .where(and(eq(experimentSurveys.experimentId, experimentId), eq(experimentSurveys.surveyId, surveyId)));
  }
  if (guideId) {
    await db
      .delete(experimentInterviewGuides)
      .where(and(eq(experimentInterviewGuides.experimentId, experimentId), eq(experimentInterviewGuides.guideId, guideId)));
  }
  revalidatePath(`/experiments/${experimentId}`);
}

// Trava o critério de sucesso ANTES do resultado — o timestamp impede
// preencher o critério depois de já saber o resultado (seção 12).
export async function lockSuccessCriteria(experimentId: string, formData: FormData) {
  const { role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  const [exp] = await db.select().from(experiments).where(eq(experiments.id, experimentId)).limit(1);
  if (!exp) throw new Error("Experimento não encontrado.");
  if (exp.resultRecordedAt) throw new Error("Já há resultado registrado — não é possível travar o critério retroativamente.");

  await db
    .update(experiments)
    .set({
      successCriteria: String(formData.get("successCriteria") || ""),
      successCriteriaLockedAt: new Date(),
      status: "in_progress",
    })
    .where(eq(experiments.id, experimentId));
  revalidatePath(`/experiments/${experimentId}`);
}

export async function recordResult(experimentId: string, formData: FormData) {
  const { user, role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  const [exp] = await db.select().from(experiments).where(eq(experiments.id, experimentId)).limit(1);
  if (!exp) throw new Error("Experimento não encontrado.");
  if (!exp.successCriteriaLockedAt) {
    throw new Error("Defina e trave o critério de sucesso antes de registrar o resultado.");
  }

  const conclusion = String(formData.get("conclusion") || "");
  const createEvidenceFlag = formData.get("createEvidence") === "true";

  await db
    .update(experiments)
    .set({
      resultObserved: String(formData.get("resultObserved") || ""),
      sampleActual: Number(formData.get("sampleActual") || 0) || null,
      conclusion,
      nextStep: String(formData.get("nextStep") || ""),
      status: "completed",
      resultRecordedAt: new Date(),
    })
    .where(eq(experiments.id, experimentId));

  if (createEvidenceFlag) {
    const [ev] = await db
      .insert(evidence)
      .values({
        projectId: exp.projectId,
        source: `Experimento — ${exp.method}`,
        type: "experiment",
        personaId: exp.personaId,
        context: exp.objective,
        content: `${String(formData.get("resultObserved") || "")}\n\nConclusão: ${conclusion}`,
        sampleSize: Number(formData.get("sampleActual") || 0) || exp.samplePlanned,
        qualityScore: 80,
        reliabilityScore: 80,
        originClass: "real_data",
        originMethod: exp.method,
        generatedBy: "human",
        createdBy: user.id,
      })
      .returning();

    await db.insert(hypothesisEvidence).values({
      hypothesisId: exp.hypothesisId,
      evidenceId: ev.id,
      favorable: formData.get("favorable") !== "false",
    });
    await recomputeHypothesis(exp.hypothesisId, user.id);
  }

  revalidatePath(`/experiments/${experimentId}`);
  revalidatePath(`/hypotheses/${exp.hypothesisId}`);
}
