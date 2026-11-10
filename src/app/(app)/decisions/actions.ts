"use server";

import { db } from "@/db";
import { decisions, opportunities } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function createDecision(formData: FormData) {
  const { user, project, role } = await getPageContext();

  const opportunityId = String(formData.get("opportunityId") || "") || null;
  const decisionText = String(formData.get("decisionText") || "");
  const rationale = String(formData.get("rationale") || "");
  const hypothesisRefs = formData.getAll("hypothesisRefs").map(String).filter(Boolean);
  const evidenceRefs = formData.getAll("evidenceRefs").map(String).filter(Boolean);
  const overriddenMethodology = formData.get("overriddenMethodology") === "true";

  // Em produção o Next.js esconde a mensagem de erros lançados numa Server
  // Action (a tela só mostra "500"). Por isso o motivo é capturado aqui e a
  // pessoa volta ao formulário com o aviso e o que já tinha preenchido.
  // O redirect() fica FORA do try/catch (ele funciona lançando uma exceção
  // especial que não pode ser engolida).
  let errorMessage: string | null = null;
  let createdId: string | null = null;
  try {
    if (role === "viewer") throw new Error("Viewers não podem registrar decisões.");
    if (!decisionText.trim()) throw new Error("Escreva o que foi decidido.");

    // Governança: uma decisão só fica sem hipótese/evidência vinculada se isso
    // for explicitamente assumido como override da metodologia recomendada —
    // nunca por omissão silenciosa no formulário.
    if (hypothesisRefs.length === 0 && evidenceRefs.length === 0 && !overriddenMethodology) {
      throw new Error(
        "Toda decisão precisa referenciar ao menos uma hipótese ou evidência. Selecione uma (ou mais) nas listas abaixo ou, se esta decisão foi tomada sem evidência suficiente, marque a caixa de override da metodologia."
      );
    }

    const [created] = await db
      .insert(decisions)
      .values({
        projectId: project.id,
        decisionText,
        rationale,
        opportunityId,
        hypothesisRefs,
        evidenceRefs,
        overriddenMethodology,
        decidedBy: user.id,
      })
      .returning();
    createdId = created.id;

    if (opportunityId) {
      // Uma decisão registrada normalmente empurra a oportunidade para "em progresso".
      await db.update(opportunities).set({ status: "prioritized" }).where(eq(opportunities.id, opportunityId));
    }
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : String(e);
    console.error("[createDecision] falhou:", errorMessage);
  }

  if (errorMessage || !createdId) {
    const params = new URLSearchParams();
    if (opportunityId) params.set("opportunityId", opportunityId);
    params.set("error", (errorMessage ?? "Não foi possível registrar a decisão.").slice(0, 600));
    params.set("decisionText", decisionText.slice(0, 1500));
    params.set("rationale", rationale.slice(0, 1500));
    if (hypothesisRefs.length) params.set("h", hypothesisRefs.join(","));
    if (evidenceRefs.length) params.set("e", evidenceRefs.join(","));
    if (overriddenMethodology) params.set("override", "1");
    redirect(`/decisions/new?${params.toString()}`);
  }

  revalidatePath("/decisions");
  revalidatePath("/opportunities");
  redirect(`/decisions/${createdId}`);
}
