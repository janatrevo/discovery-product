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
  opportunityImages,
} from "@/db/schema";
import { eq, and, asc, sql, inArray } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { draftProductDoc } from "@/lib/ai";
import { linesToArray } from "@/lib/list-utils";
import {
  createFeature,
  updateFeature,
  getFeature,
  syncUserStories,
  getFeatureFieldRefs,
  uploadAttachment,
  type AzureAttachment,
} from "@/lib/azure-devops";
import { mergeAzureTags } from "@/lib/tags";
import { buildFeatureDescription, buildListHtml, buildFeatureAcceptanceHtml } from "@/lib/azure-feature-description";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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
  // Fluxo escrito: texto livre (quebras de linha e recuos importam), então não passa por linesToArray.
  const flowText = String(formData.get("flowText") ?? "").replace(/\r\n/g, "\n").trim() || null;

  const [existing] = await db.select().from(productDocs).where(eq(productDocs.opportunityId, opportunityId)).limit(1);

  // Edição humana nunca fica marcada como se ninguém tivesse tocado — um
  // rascunho de IA editado vira "ai_assisted", nunca continua "ai_generated".
  const nextGeneratedBy = existing?.generatedBy === "ai_generated" ? "ai_assisted" : existing?.generatedBy ?? "human";

  if (existing) {
    await db
      .update(productDocs)
      .set({ goals, nonGoals, openQuestions, businessRules, successMetrics, flowText, generatedBy: nextGeneratedBy, updatedAt: new Date() })
      .where(eq(productDocs.id, existing.id));
  } else {
    await db.insert(productDocs).values({
      opportunityId,
      goals,
      nonGoals,
      openQuestions,
      businessRules,
      successMetrics,
      flowText,
      generatedBy: "human",
      createdBy: user.id,
    });
  }

  revalidatePath(`/opportunities/${opportunityId}/doc`);
}

// Transforma a oportunidade (com seu PRD já gerado/revisado) em um card
// Feature no board Trevo One do Azure DevOps — ou atualiza o card já
// vinculado, se a oportunidade já tiver sido enviada antes (nunca cria um
// segundo card para a mesma oportunidade). Só Owner pode enviar, mesma régua
// do resto da integração com Azure DevOps (ver src/app/(app)/azure-devops/actions.ts).
export async function sendToAzureDevOps(opportunityId: string) {
  const { project, role } = await getPageContext();

  // Em produção o Next.js esconde a mensagem de qualquer erro lançado numa
  // Server Action (a tela só mostra "500"). Por isso o motivo real é capturado
  // aqui e devolvido na URL (?azureError=...), onde a página o exibe.
  // O redirect() fica FORA do try/catch porque ele funciona lançando uma
  // exceção especial que não pode ser engolida.
  let errorMessage: string | null = null;
  let storiesSummary = "0,0";
  try {
    if (role !== "owner") throw new Error("Só administradores (Owner) podem enviar para o Azure DevOps.");

    const opp = await loadOpportunity(opportunityId, project.id);
    const [doc] = await db.select().from(productDocs).where(eq(productDocs.opportunityId, opportunityId)).limit(1);
    if (!doc) throw new Error("Gere (ou escreva) o PRD desta oportunidade antes de enviar para o Azure DevOps.");

    // Só as stories confirmadas (as sugeridas por IA e ainda não revisadas ficam de fora).
    const stories = (
      await db
        .select()
        .from(userStories)
        .where(eq(userStories.opportunityId, opportunityId))
        .orderBy(asc(userStories.orderIndex))
    ).filter((s) => s.confirmed);

    // Campos próprios da Feature no Azure (regras de negócio, critérios de
    // aceite, métricas). Os que não existirem continuam dentro da Description.
    const refs = await getFeatureFieldRefs();
    const storiesForAzure = stories.map((s) => ({
      asA: s.asA,
      iWant: s.iWant,
      soThat: s.soThat,
      acceptanceCriteria: (s.acceptanceCriteria as string[]) ?? [],
    }));
    const fields: Record<string, string> = {};
    if (refs.businessRules) fields[refs.businessRules] = buildListHtml(doc.businessRules as string[]);
    if (refs.acceptanceCriteria) fields[refs.acceptanceCriteria] = buildFeatureAcceptanceHtml(storiesForAzure);
    if (refs.successMetrics) fields[refs.successMetrics] = buildListHtml(doc.successMetrics as string[]);

    // Imagens de apoio (fluxogramas): sobe ao Azure só as que ainda não estão
    // anexadas NESTE card; as demais reaproveitam o endereço já gravado.
    const images = await db
      .select()
      .from(opportunityImages)
      .where(eq(opportunityImages.opportunityId, opportunityId))
      .orderBy(asc(opportunityImages.orderIndex), asc(opportunityImages.createdAt));
    const imageUrls = new Map<string, string>();
    const newAttachments: AzureAttachment[] = [];
    const newlyUploaded: string[] = [];
    for (const img of images) {
      if (img.azureUrl && opp.azureFeatureId && img.azureFeatureId === opp.azureFeatureId) {
        imageUrls.set(img.id, img.azureUrl);
        continue;
      }
      const up = await uploadAttachment(img.fileName, new Uint8Array(img.data));
      imageUrls.set(img.id, up.url);
      newAttachments.push({ url: up.url, comment: img.title });
      newlyUploaded.push(img.id);
    }

    const description = buildFeatureDescription({
      flowText: doc.flowText,
      images: images.map((img) => ({ url: imageUrls.get(img.id)!, title: img.title })),
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
      storiesAsChildren: true,
      inline: {
        businessRules: !refs.businessRules,
        acceptanceCriteria: !refs.acceptanceCriteria,
        successMetrics: !refs.successMetrics,
      },
    });

    // Tags: o card fica com as tags desta oportunidade (mais o que já existir lá,
    // como ab:manter), e só saem as que este app levou antes e foram removidas aqui.
    const appTags = opp.tags ?? [];
    let featureId = opp.azureFeatureId;
    if (featureId) {
      const current = await getFeature(featureId);
      const tags = mergeAzureTags(current.tags, appTags, opp.azureSyncedTags ?? []);
      await updateFeature(featureId, { title: opp.title, description, fields, tags, attachments: newAttachments });
    } else {
      const created = await createFeature({
        title: opp.title,
        description,
        fields,
        tags: mergeAzureTags([], appTags, []),
        attachments: newAttachments,
      });
      featureId = created.id;
      // Grava o vínculo já aqui: se as stories falharem logo abaixo, um novo
      // envio reaproveita este card em vez de criar outro.
      await db.update(opportunities).set({ azureFeatureId: created.id }).where(eq(opportunities.id, opportunityId));
    }
    await db.update(opportunities).set({ azureSyncedTags: appTags }).where(eq(opportunities.id, opportunityId));
    for (const imgId of newlyUploaded) {
      await db
        .update(opportunityImages)
        .set({ azureFeatureId: featureId, azureUrl: imageUrls.get(imgId) })
        .where(eq(opportunityImages.id, imgId));
    }

    // Cada user story vira um item filho da Feature (com os critérios de aceite).
    const sync = await syncUserStories(
      featureId,
      stories.map((s) => ({
        id: s.id,
        asA: s.asA,
        iWant: s.iWant,
        soThat: s.soThat,
        acceptanceCriteria: (s.acceptanceCriteria as string[]) ?? [],
        priority: s.priority,
      }))
    );
    storiesSummary = `${sync.created},${sync.updated}`;
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : String(e);
    console.error("[sendToAzureDevOps] falhou:", errorMessage);
  }

  revalidatePath(`/opportunities/${opportunityId}/doc`);
  revalidatePath(`/opportunities/${opportunityId}`);
  revalidatePath("/azure-devops");

  if (errorMessage) {
    redirect(`/opportunities/${opportunityId}/doc?azureError=${encodeURIComponent(errorMessage.slice(0, 900))}`);
  }
  redirect(`/opportunities/${opportunityId}/doc?azureOk=1&azureStories=${storiesSummary}`);
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

// Edita o texto de uma story já criada (papel, o que quer, para quê, critérios
// de aceite e prioridade) sem precisar remover e criar de novo. Se a story já
// foi enviada ao Azure DevOps, "Atualizar Feature" depois leva o novo texto
// para o item de lá (o vínculo é pela tag discovery-story-<id>).
export async function updateUserStory(storyId: string, formData: FormData) {
  const { project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");

  const [story] = await db.select().from(userStories).where(eq(userStories.id, storyId)).limit(1);
  if (!story) throw new Error("User story não encontrada.");
  await loadOpportunity(story.opportunityId, project.id);

  const iWant = String(formData.get("iWant") || "").trim();
  if (!iWant) throw new Error("Descreva o que a story precisa entregar.");
  const priority = String(formData.get("priority") || story.priority);

  await db
    .update(userStories)
    .set({
      asA: String(formData.get("asA") || "").trim() || "usuário",
      iWant,
      soThat: String(formData.get("soThat") || "").trim(),
      acceptanceCriteria: linesToArray(formData.get("acceptanceCriteria")),
      priority: (["must", "should", "could"].includes(priority) ? priority : story.priority) as never,
    })
    .where(eq(userStories.id, storyId));

  revalidatePath(`/opportunities/${story.opportunityId}/doc`);
}


// ---------- Imagens de apoio (fluxogramas) ----------
// O envio do arquivo é feito pela rota /api/opportunities/[id]/images (limite de
// corpo maior que o de Server Actions); aqui ficam legenda, ordem e exclusão.
async function loadImage(imageId: string, projectId: string) {
  const [img] = await db
    .select({
      id: opportunityImages.id,
      opportunityId: opportunityImages.opportunityId,
      orderIndex: opportunityImages.orderIndex,
      projectId: opportunities.projectId,
    })
    .from(opportunityImages)
    .innerJoin(opportunities, eq(opportunities.id, opportunityImages.opportunityId))
    .where(eq(opportunityImages.id, imageId))
    .limit(1);
  if (!img || img.projectId !== projectId) throw new Error("Imagem não encontrada.");
  return img;
}

export async function updateOpportunityImageTitle(imageId: string, formData: FormData) {
  const { project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  const img = await loadImage(imageId, project.id);
  const title = String(formData.get("title") || "").trim().slice(0, 160);
  if (!title) throw new Error("Escreva uma legenda.");
  await db.update(opportunityImages).set({ title }).where(eq(opportunityImages.id, imageId));
  revalidatePath(`/opportunities/${img.opportunityId}/doc`);
}

export async function moveOpportunityImage(imageId: string, direction: "up" | "down") {
  const { project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  const img = await loadImage(imageId, project.id);
  const list = await db
    .select({ id: opportunityImages.id })
    .from(opportunityImages)
    .where(eq(opportunityImages.opportunityId, img.opportunityId))
    .orderBy(asc(opportunityImages.orderIndex), asc(opportunityImages.createdAt));
  const ids = list.map((r) => r.id);
  const from = ids.indexOf(imageId);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= ids.length) return;
  [ids[from], ids[to]] = [ids[to], ids[from]];
  // Regrava a ordem inteira (0..n-1): evita empates e resolve listas antigas.
  for (let i = 0; i < ids.length; i++) {
    await db.update(opportunityImages).set({ orderIndex: i }).where(eq(opportunityImages.id, ids[i]));
  }
  revalidatePath(`/opportunities/${img.opportunityId}/doc`);
}

export async function deleteOpportunityImage(imageId: string) {
  const { project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  const img = await loadImage(imageId, project.id);
  await db.delete(opportunityImages).where(inArray(opportunityImages.id, [imageId]));
  revalidatePath(`/opportunities/${img.opportunityId}/doc`);
}
