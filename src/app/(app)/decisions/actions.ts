"use server";

import { db } from "@/db";
import { decisions, opportunities } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function createDecision(formData: FormData) {
  const { user, project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Viewers não podem registrar decisões.");

  const opportunityId = String(formData.get("opportunityId") || "") || null;
  const hypothesisRefs = formData.getAll("hypothesisRefs").map(String).filter(Boolean);
  const evidenceRefs = formData.getAll("evidenceRefs").map(String).filter(Boolean);
  const overriddenMethodology = formData.get("overriddenMethodology") === "true";

  // Governança: uma decisão só fica sem hipótese/evidência vinculada se isso
  // for explicitamente assumido como override da metodologia recomendada —
  // nunca por omissão silenciosa no formulário.
  if (hypothesisRefs.length === 0 && evidenceRefs.length === 0 && !overriddenMethodology) {
    throw new Error(
      "Toda decisão precisa referenciar ao menos uma hipótese ou evidência. Se esta decisão foi tomada sem evidência real suficiente, marque a caixa de override da metodologia."
    );
  }

  const [created] = await db
    .insert(decisions)
    .values({
      projectId: project.id,
      decisionText: String(formData.get("decisionText") || ""),
      rationale: String(formData.get("rationale") || ""),
      opportunityId,
      hypothesisRefs,
      evidenceRefs,
      overriddenMethodology,
      decidedBy: user.id,
    })
    .returning();

  if (opportunityId) {
    // Uma decisão registrada normalmente empurra a oportunidade para "em progresso".
    await db
      .update(opportunities)
      .set({ status: "prioritized" })
      .where(eq(opportunities.id, opportunityId));
  }

  revalidatePath("/decisions");
  revalidatePath("/opportunities");
  redirect(`/decisions/${created.id}`);
}
