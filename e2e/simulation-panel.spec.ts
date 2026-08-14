import { test, expect } from "@playwright/test";
import { signup, uniqueEmail, fieldByLabel } from "./helpers";

test("painel multi-persona: personas lado a lado, síntese de divergência, e rótulo de simulação sempre presente", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const email = uniqueEmail("owner-sim");
  await signup(page, { name: "QA Sim Owner", email, password: "SenhaForte123", orgName: "QA Sim Org" });

  async function createPersona(name: string) {
    await page.goto("/personas/new");
    await fieldByLabel(page, "Nome").fill(name);
    await page.getByRole("button", { name: "Criar persona" }).click();
    await expect(page).toHaveURL(/\/personas\/[0-9a-f-]{36}/, { timeout: 15_000 });
  }

  await createPersona("Persona QA A — cética com tecnologia");
  await createPersona("Persona QA B — early adopter");

  await page.goto("/simulations/new");
  const personaSelect = page.locator('select[name="personaIds"]');
  const optionValues = await personaSelect
    .locator("option")
    .evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value));
  expect(optionValues.length, "precisa ter as 2 personas recém-criadas disponíveis").toBeGreaterThanOrEqual(2);
  await personaSelect.selectOption(optionValues.slice(0, 2));

  await fieldByLabel(page, "Cenário").fill("A pessoa precisa agendar uma teleconsulta pela primeira vez.");
  await fieldByLabel(page, "Tarefa").fill("Agendar a consulta e entender o valor cobrado.");
  await page.getByRole("button", { name: "Rodar simulação exploratória" }).click();

  // Com a IA real ativada (não mock), a rodada faz 2 chamadas de IA em
  // paralelo (uma por persona) + 1 chamada de síntese sequencial depois —
  // e o modelo "pensa" antes de responder, então isso pode levar bem mais
  // que os 30s originais (pensados para o modo demo/mock, quase instantâneo).
  await expect(page).toHaveURL(/\/simulations\/[0-9a-f-]{36}/, { timeout: 100_000 });

  // Regra de governança inegociável do produto: simulação de IA nunca pode
  // aparecer sem o rótulo deixando claro que não é evidência real — uma
  // ocorrência por persona no painel.
  await expect(page.getByText("simulação — não é evidência real")).toHaveCount(2);

  // Painel com 2+ personas precisa comparar e sintetizar onde elas divergem
  // (o ponto principal do painel multi-persona).
  await expect(page.getByText("Síntese do painel")).toBeVisible();
});
