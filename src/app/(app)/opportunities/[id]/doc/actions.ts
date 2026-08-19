"use server";

import { db } from "@/db";
import {
  opportunities,
  productDocs,
  userStories,
  hypotheses,
  personas,
  evidence,
  hypothesisEvidence,
} from "@/db/schema";
import { eq, and, asc, sql } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { draftProductDoc } from "@/lib/ai";
import { linesToArray } from "@/lib/list-utils";
import { createFeature, updateFeature } from "@/lib/azure-devops";
import { buildFeatureDescription } from "@/lib/azure-feature-description";
import { revalidatePath } from "next/cache";

async function loadOpportunity(opportunityId: string, projectId: string) {
  const [opp] = await db.select().from(opportunities).where(eq(opportunities.id, opportunityId)).limit(1);
  if (!opp || opp.projectId !== projectId) throw new Error("Oportunidade não encontrada.");
  return opp;
}

// Gera (ou regenera) o rascunho de PRD + user stories por IA, com base no
// que já foi validado: hipótese, persona e evidência REAL vinculadas à
// oportunidade. Regenerar substitui só as stories de IA ainda não
// confirmadas — qualquer story já revisada por um humano é preservada.
export async function generateProductDoc(opportunityId: string) {
  const { user, project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");

  const opp = await loadOpportunity(opportunityId, project.id);

  const [hypothesis, persona] = await Promise.all([
    opp.hypothesisId ? db.select().from(hypotheses).where(eq(hypotheses.id, opp.hypothesisId)).limit(1).then((r) => r[0]) : null,
    opp.personaId ? db.select().from(personas).where(eq(personas.id, opp.personaId)).limit(1).then((r) => r[0]) : null,
  ]);

  const evidenceLinks = opp.hypothesisId
    ? await db
        .select({ ev: evidence, favorable: hypothesisEvidence.favorable })
        .from(hypothesisEvidence)
        .innerJoin(evidence, eq(evidence.id, hypothesisEvidence.evidenceId))
        .where(and(eq(hypothesisEvidence.hypothesisId, opp.hypothesisId), eq(evidence.originClass, "real_data")))
    : [];

  const { data, isMock, modelVersion } = await draftProductDoc({
    opportunityTitle: opp.title,
    opportunityDescription: opp.description ?? "",
    problemRef: opp.problemRef ?? "",
    hypothesisTitle: hypothesis?.title,
    personaSummary: persona ? `${persona.name} — ${persona.shortDescription ?? ""}` : undefined,
    evidence: evidenceLinks.map((l) => ({ type: l.ev.type, content: l.ev.content, favorable: l.favorable })),
  });

  const [existingDoc] = await db.select().from(productDocs).where(eq(productDocs.opportunityId, opportunityId)).limit(1);

  const promptSnapshot = `Oportunidade: ${opp.title}\nHipótese: ${hypothesis?.title ?? "nenhuma"}\nEvidências reais consideradas: ${evidenceLinks.length}`;

  if (existingDoc) {
    await db
      .update(productDocs)
      .set({
        goals: data.goals,
        nonGoals: data.nonGoals,
        openQuestions: data.openQuestions,
        businessRules: data.businessRules,
        successMetrics: data.successMetrics,
        generatedBy: "ai_generated",
        promptSnapshot,
        modelVersion,
        reviewedBy: null,
        reviewedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(productDocs.id, existingDoc.id));
  } else {
    await db.insert(productDocs).values({
      opportunityId,
      goals: data.goals,
      nonGoals: data.nonGoals,
      openQuestions: data.openQuestions,
      businessRules: data.businessRules,
      successMetrics: data.successMetrics,
      generatedBy: "ai_generated",
      promptSnapshot,
      modelVersion,
      createdBy: user.id,
    });
  }

  // Substitui só as stories de IA que ainda não foram confirmadas — stories
  // manuais ou já revisadas por um humano nunca são apagadas por uma nova
  // geração.
  await db
    .delete(userStories)
    .where(and(eq(userStories.opportunityId, opportunityId), eq(userStories.aiGenerated, true), eq(userStories.confirmed, false)));

  if (data.userStories.length) {
    const [{ count: existingCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userStories)
      .where(eq(userStories.opportunityId, opportunityId));

    await db.insert(userStories).values(
      data.userStories.map((s, idx) => ({
        opportunityId,
        asA: s.asA?.slice(0, 255) || "usuário",
        iWant: s.iWant,
        soThat: s.soThat || "",
        acceptanceCriteria: s.acceptanceCriteria ?? [],
        priority: ["must", "should", "could"].includes(s.priority) ? s.priority : "should",
        aiGenerated: true,
        confirmed: false,
        orderIndex: (existingCount ?? 0) + idx,
        createdBy: user.id,
      }))
    );
  }

  void isMock; // usado só para decisão de UX no futuro; hoje o card já indica modo demo via modelVersion.

  revalidatePath(`/opportunities/${opportunityId}/doc`);
}

export async function updateProductDoc(opportunityId: string, formData: FormData) {
  const { user, project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  await loadOpportunity(opportunityId, project.id);

  const goals = linesToArray(formData.get("goals"));
  const nonGoals = linesToArray(formData.get("nonGoals"));
  const openQuestions = linesToArray(formData.get("openQuestions"));
  const businessRules = linesToArray(formData.get("businessRules"));
  const successMetrics = linesToArray(formData.get("successMetrics"));

  const [existing] = await db.select().from(productDocs).where(eq(productDocs.opportunityId, opportunityId)).limit(1);

  // Edição humana nunca fica marcada como se ninguém tivesse tocado — um
  // rascunho de IA editado vira "ai_assisted", nunca continua "ai_generated".
  const nextGeneratedBy = existing?.generatedBy === "ai_generated" ? "ai_assisted" : existing?.generatedBy ?? "human";

  if (existing) {
    await db
      .update(productDocs)
      .set({ goals, nonGoals, openQuestions, businessRules, successMetrics, generatedBy: nextGeneratedBy, updatedAt: new Date() })
      .where(eq(productDocs.id, existing.id));
  } else {
    await db.insert(productDocs).values({
      opportunityId,
      goals,
      nonGoals,
      openQuestions,
      businessRules,
      successMetrics,
      generatedBy: "human",
      createdBy: user.id,
    });
  }

  revalidatePath(`/opportunities/${opportunityId}/doc`);
}

// Transforma a oportunidade (com seu PRD já gerado/revisado) em um card
// Feature no board Trevo Labs do Azure DevOps — ou atualiza o card já
// vinculado, se a oportunidade já tiver sido enviada antes (nunca cria um
// segundo card para a mesma oportunidade). Só Owner pode enviar, mesma régua
// do resto da integração com Azure DevOps (ver src/app/(app)/azure-devops/actions.ts).
export async function sendToAzureDevOps(opportunityId: string) {
  const { project, role } = await getPageContext();
  if (role !== "owner") throw new Error("Só administradores (Owner) podem enviar para o Azure DevOps.");

  const opp = await loadOpportunity(opportunityId, project.id);
  const [doc] = await db.select().from(productDocs).where(eq(productDocs.opportunityId, opportunityId)).limit(1);
  if (!doc) throw new Error("Gere (ou escreva) o PRD desta oportunidade antes de enviar para o Azure DevOps.");

  const stories = await db
    .select()
    .from(userStories)
    .where(eq(userStories.opportunityId, opportunityId))
    .orderBy(asc(userStories.orderIndex));

  const description = buildFeatureDescription({
    opportunityTitle: opp.title,
    opportunityDescription: opp.description ?? "",
    problemRef: opp.problemRef,
    goals: doc.goals as string[],
    nonGoals: doc.nonGoals as string[],
    openQuestions: doc.openQuestions as string[],
    businessRules: doc.businessRules as string[],
    successMetrics: doc.successMetrics as string[],
    userStories: stories.map((s) => ({
      asA: s.asA,
      iWant: s.iWant,
      soThat: s.soThat,
      acceptanceCriteria: (s.acceptanceCriteria as string[]) ?? [],
    })),
  });

  if (opp.azureFeatureId) {
    await updateFeature(opp.azureFeatureId, { title: opp.title, description });
  } else {
    const created = await createFeature({ title: opp.title, description });
    await db.update(opportunities).set({ azureFeatureId: created.id }).where(eq(opportunities.id, opportunityId));
  }

  revalidatePath(`/opportunities/${opportunityId}/doc`);
  revalidatePath(`/opportunities/${opportunityId}`);
  revalidatePath("/azure-devops");
}

export async function markDocReviewed(opportunityId: string) {
  const { user, project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  await loadOpportunity(opportunityId, project.id);

  const [existing] = await db.select().from(productDocs).where(eq(productDocs.opportunityId, opportunityId)).limit(1);
  if (!existing) throw new Error("Ainda não há um documento para marcar como revisado.");

  await db
    .update(productDocs)
    .set({ reviewedBy: user.id, reviewedAt: new Date() })
    .where(eq(productDocs.id, existing.id));

  revalidatePath(`/opportunities/${opportunityId}/doc`);
}

export async function addUserStory(opportunityId: string, formData: FormData) {
  const { user, project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  await loadOpportunity(opportunityId, project.id);

  const iWant = String(formData.get("iWant") || "").trim();
  if (!iWant) throw new Error("Descreva o que a story precisa entregar.");

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(userStories)
    .where(eq(userStories.opportunityId, opportunityId));

  await db.insert(userStories).values({
    opportunityId,
    asA: String(formData.get("asA") || "usuário"),
    iWant,
    soThat: String(formData.get("soThat") || ""),
    acceptanceCriteria: linesToArray(formData.get("acceptanceCriteria")),
    priority: String(formData.get("priority") || "should") as never,
    aiGenerated: false,
    confirmed: true,
    orderIndex: count ?? 0,
    createdBy: user.id,
  });

  revalidatePath(`/opportunities/${opportunityId}/doc`);
}

export async function confirmUserStory(storyId: string) {
  const { role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  await db.update(userStories).set({ confirmed: true }).where(eq(userStories.id, storyId));
  revalidatePath(`/opportunities`, "layout");
}

export async function toggleStoryDone(storyId: string, done: boolean) {
  const { role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  await db.update(userStories).set({ done }).where(eq(userStories.id, storyId));
  revalidatePath(`/opportunities`, "layout");
}

export async function deleteUserStory(storyId: string) {
  const { role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  await db.delete(userStories).where(eq(userStories.id, storyId));
  revalidatePath(`/opportunities`, "layout");
}
