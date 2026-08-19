"use server";

import { db } from "@/db";
import { simulationRuns, simulationResponses, personas, products } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { simulatePersonaScenario, synthesizePersonaPanel } from "@/lib/ai";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function runSimulation(hypothesisId: string | null, formData: FormData) {
  const { user, project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");

  const personaIds = formData.getAll("personaIds").map(String).filter(Boolean);
  if (personaIds.length === 0) throw new Error("Selecione ao menos uma persona.");
  const productId = String(formData.get("productId") || "") || null;
  const scenario = String(formData.get("scenario") || "");
  const task = String(formData.get("task") || "");

  const selectedPersonas = await db.select().from(personas).where(inArray(personas.id, personaIds));
  let productDescription = String(formData.get("productDescription") || "");
  if (productId) {
    const [p] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
    if (p) productDescription = `${p.name} — ${p.description ?? ""} Proposta de valor: ${p.valueProposition ?? ""}`;
  }

  const [run] = await db
    .insert(simulationRuns)
    .values({
      projectId: project.id,
      hypothesisId,
      mode: "scenario",
      personaIds,
      productId,
      scenario,
      task,
      promptSnapshot: `${scenario}\n${task}\n${productDescription}`,
      createdBy: user.id,
    })
    .returning();

  // Roda todas as personas em paralelo (não em série): num contexto de
  // startup onde a pesquisa real dificilmente acontece a tempo, o painel
  // completo precisa voltar o mais rápido possível.
  const results = await Promise.all(
    selectedPersonas.map(async (persona) => {
      const { data, isMock, modelVersion } = await simulatePersonaScenario(persona, productDescription, scenario, task);
      return { persona, data, isMock, modelVersion };
    })
  );

  await db.insert(simulationResponses).values(
    results.map((r) => ({
      simulationRunId: run.id,
      personaId: r.persona.id,
      responseJson: r.data,
      rawText: JSON.stringify(r.data, null, 2),
    }))
  );

  let anyMock = results.some((r) => r.isMock);
  const modelVersion = results.find((r) => !r.isMock)?.modelVersion ?? results[0]?.modelVersion ?? null;

  // Painel multi-persona: sintetiza consenso/divergência entre as respostas
  // (só faz sentido comparar quando há mais de uma persona na rodada).
  let synthesisJson: unknown = null;
  if (results.length > 1) {
    const synthesis = await synthesizePersonaPanel(
      results.map((r) => ({ personaName: r.persona.name, data: r.data as Record<string, unknown> })),
      scenario,
      task
    );
    if (synthesis.data) {
      synthesisJson = synthesis.data;
      if (synthesis.isMock) anyMock = true;
    }
  }

  await db
    .update(simulationRuns)
    .set({ isMock: anyMock, modelVersion, synthesisJson })
    .where(eq(simulationRuns.id, run.id));

  revalidatePath("/simulations");
  if (hypothesisId) revalidatePath(`/hypotheses/${hypothesisId}`);
  redirect(`/simulations/${run.id}`);
}

// Existia um "beco sem saída": excluir um Produto com simulação vinculada é
// bloqueado por checkProductDeletable (propositalmente, ver
// src/lib/delete-guards.ts — evita deixar a exclusão do produto quebrar o
// histórico da simulação), mas não havia nenhum jeito de excluir a própria
// simulação pela interface para desbloquear isso. simulationResponses tem
// onDelete cascade (ver schema), então excluir a rodada já limpa as
// respostas junto — não deixa nada órfão.
// Usado a partir da tela de Hipótese quando uma simulação é uma das razões
// que bloqueiam a exclusão (ver checkHypothesisDeletable, que conta por
// simulationRuns.hypothesisId — diferente de checkPersonaDeletable, que
// conta por simulationResponses.personaId). Aqui dá pra desvincular sem
// apagar a simulação, porque simulationRuns.hypothesisId é opcional ("relação
// inspired_research, nunca evidence_for", ver src/db/schema.ts).
export async function unlinkHypothesisFromSimulation(runId: string, hypothesisId: string) {
  const { role } = await getPageContext();
  if (role !== "owner" && role !== "editor") throw new Error("Sem permissão.");
  await db.update(simulationRuns).set({ hypothesisId: null }).where(eq(simulationRuns.id, runId));
  revalidatePath(`/simulations/${runId}`);
  revalidatePath(`/hypotheses/${hypothesisId}`);
}

export async function deleteSimulation(runId: string, redirectTo?: string) {
  const { project, role } = await getPageContext();
  if (role !== "owner" && role !== "editor") throw new Error("Sem permissão para excluir simulações.");

  const [run] = await db.select().from(simulationRuns).where(eq(simulationRuns.id, runId)).limit(1);
  if (!run || run.projectId !== project.id) throw new Error("Simulação não encontrada.");

  await db.delete(simulationRuns).where(eq(simulationRuns.id, runId));

  revalidatePath("/simulations");
  if (run.hypothesisId) revalidatePath(`/hypotheses/${run.hypothesisId}`);
  if (redirectTo) redirect(redirectTo);
}
