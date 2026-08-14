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
