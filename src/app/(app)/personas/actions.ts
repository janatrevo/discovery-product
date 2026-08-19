"use server";

import { db } from "@/db";
import { personas, personaVersions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { linesToArray } from "@/lib/list-utils";
import { checkPersonaDeletable, deleteBlockedMessage } from "@/lib/delete-guards";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

const TAG_FIELDS = [
  "goals",
  "pains",
  "frustrations",
  "needs",
  "motivations",
  "behaviors",
  "fears",
  "objections",
  "decisionCriteria",
  "realQuotes",
  "currentAlternatives",
  "competitorProducts",
  "sources",
] as const;

function computeCompleteness(values: Record<string, unknown>) {
  const essential = ["name", "shortDescription", "jtbdMain", "origin"];
  const context = [
    "professionalContext",
    "personalContext",
    "usageContext",
    "purchaseContext",
    "techFamiliarity",
  ];
  const behavioral = ["goals", "pains", "needs", "motivations", "behaviors"];
  const all = [...essential, ...context, ...behavioral];
  const filled = all.filter((k) => {
    const v = values[k];
    return Array.isArray(v) ? v.length > 0 : Boolean(v);
  });
  return Math.round((filled.length / all.length) * 100);
}

export async function createPersona(formData: FormData) {
  const { user, project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Viewers não podem criar personas.");

  const values: Record<string, unknown> = {
    projectId: project.id,
    productId: String(formData.get("productId") || "") || null,
    name: String(formData.get("name") || ""),
    origin: String(formData.get("origin") || "synthetic"),
    shortDescription: String(formData.get("shortDescription") || ""),
    jtbdMain: String(formData.get("jtbdMain") || ""),
    professionalContext: String(formData.get("professionalContext") || ""),
    personalContext: String(formData.get("personalContext") || ""),
    usageContext: String(formData.get("usageContext") || ""),
    purchaseContext: String(formData.get("purchaseContext") || ""),
    techFamiliarity: String(formData.get("techFamiliarity") || ""),
    problemKnowledge: String(formData.get("problemKnowledge") || ""),
    solutionKnowledge: String(formData.get("solutionKnowledge") || ""),
    priceSensitivity: String(formData.get("priceSensitivity") || ""),
    characteristicLanguage: String(formData.get("characteristicLanguage") || ""),
    createdBy: user.id,
  };
  for (const f of TAG_FIELDS) {
    values[f] = linesToArray(formData.get(f));
  }

  // Regra estrutural (seção 10 do documento): persona research-based exige
  // ao menos uma fonte de evidência informada antes de salvar.
  if (values.origin === "research_based" && (values.sources as string[]).length === 0) {
    throw new Error("Personas research-based precisam de ao menos uma fonte de evidência.");
  }

  values.completeness = computeCompleteness(values);

  const [created] = await db.insert(personas).values(values as never).returning();
  revalidatePath("/personas");
  redirect(`/personas/${created.id}`);
}

export async function updatePersona(personaId: string, formData: FormData) {
  const { user, role } = await getPageContext();
  if (role === "viewer") throw new Error("Viewers não podem editar personas.");

  const [existing] = await db.select().from(personas).where(eq(personas.id, personaId)).limit(1);
  if (!existing) throw new Error("Persona não encontrada.");

  const values: Record<string, unknown> = {
    productId: String(formData.get("productId") || "") || null,
    name: String(formData.get("name") || ""),
    origin: String(formData.get("origin") || existing.origin),
    shortDescription: String(formData.get("shortDescription") || ""),
    jtbdMain: String(formData.get("jtbdMain") || ""),
    professionalContext: String(formData.get("professionalContext") || ""),
    personalContext: String(formData.get("personalContext") || ""),
    usageContext: String(formData.get("usageContext") || ""),
    purchaseContext: String(formData.get("purchaseContext") || ""),
    techFamiliarity: String(formData.get("techFamiliarity") || ""),
    problemKnowledge: String(formData.get("problemKnowledge") || ""),
    solutionKnowledge: String(formData.get("solutionKnowledge") || ""),
    priceSensitivity: String(formData.get("priceSensitivity") || ""),
    characteristicLanguage: String(formData.get("characteristicLanguage") || ""),
    updatedAt: new Date(),
  };
  for (const f of TAG_FIELDS) {
    values[f] = linesToArray(formData.get(f));
  }
  values.completeness = computeCompleteness(values);

  // Evoluir de sintética -> research-based é uma alegação epistemológica forte:
  // gera versão explícita em vez de edição silenciosa (seção 10 do documento).
  const isPromotion = existing.origin === "synthetic" && values.origin === "research_based";
  if (isPromotion) {
    await db.insert(personaVersions).values({
      personaId,
      versionNo: 1,
      snapshot: existing,
      changeNote: "Promovida de sintética para research-based",
      createdBy: user.id,
    });
  }

  await db.update(personas).set(values as never).where(eq(personas.id, personaId));
  revalidatePath(`/personas/${personaId}`);
  revalidatePath("/personas");
  redirect(`/personas/${personaId}`);
}

// Usado a partir da tela de Produto quando uma persona é uma das razões que
// bloqueiam a exclusão (ver checkProductDeletable em src/lib/delete-guards.ts)
// — desvincula sem apagar a persona, só solta o produto.
export async function unlinkProductFromPersona(personaId: string, productId: string) {
  const { role } = await getPageContext();
  if (role !== "owner" && role !== "editor") throw new Error("Sem permissão.");
  await db.update(personas).set({ productId: null }).where(eq(personas.id, personaId));
  revalidatePath(`/personas/${personaId}`);
  revalidatePath(`/products/${productId}`);
}

export async function deletePersona(personaId: string) {
  const { role } = await getPageContext();
  if (role !== "owner" && role !== "editor") throw new Error("Sem permissão para excluir personas.");

  const reasons = await checkPersonaDeletable(personaId);
  if (reasons.length > 0) throw new Error(deleteBlockedMessage("esta persona", reasons));

  await db.delete(personas).where(eq(personas.id, personaId));
  revalidatePath("/personas");
  redirect("/personas");
}
