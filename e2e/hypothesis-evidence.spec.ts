import { test, expect } from "@playwright/test";
import { signup, uniqueEmail, fieldByLabel } from "./helpers";

test("evidência real favorável aumenta o Confidence Score da hipótese", async ({ page }) => {
  test.setTimeout(60_000);
  const email = uniqueEmail("owner-hyp");
  await signup(page, { name: "QA Hyp Owner", email, password: "SenhaForte123", orgName: "QA Hyp Org" });

  await page.goto("/hypotheses/new");
  await fieldByLabel(page, "Título da hipótese").fill(
    "Usuários abandonam o checkout por falta de clareza no preço"
  );
  await page.getByRole("button", { name: "Criar hipótese" }).click();
  await expect(page).toHaveURL(/\/hypotheses\/[0-9a-f-]{36}/, { timeout: 15_000 });
  const hypothesisUrl = page.url();

  async function readConfidenceScore() {
    const card = page.locator("div", { hasText: "Confidence Score" }).last();
    const text = await card.innerText();
    const match = text.match(/confidence score\s*\n?\s*(-?\d+(?:\.\d+)?)/i);
    expect(match, `não encontrei o número do Confidence Score no texto: "${text}"`).not.toBeNull();
    return Number(match![1]);
  }

  const before = await readConfidenceScore();
  expect(before, "hipótese recém-criada sem evidência deveria começar em 0").toBe(0);

  await page.goto(`${hypothesisUrl}?tab=evidence`);
  await fieldByLabel(page, "Fonte").fill("Entrevistas com 8 usuários que abandonaram o checkout");
  await fieldByLabel(page, "Favorável ou contrária à hipótese?").selectOption("true");
  await fieldByLabel(page, "Tamanho de amostra").fill("8");
  await fieldByLabel(page, "Qualidade (0-100)").fill("90");
  await fieldByLabel(page, "Confiabilidade (0-100)").fill("90");
  await fieldByLabel(page, "Conteúdo / trecho / resumo").fill(
    "8 de 8 usuários disseram que não entenderam o preço final antes de finalizar a compra."
  );
  await page.getByRole("button", { name: "Adicionar evidência" }).click();

  // A Server Action não redireciona, só atualiza a página no lugar — espera
  // a evidência aparecer na lista antes de navegar, senão a releitura do
  // score pode acontecer antes do recompute terminar no servidor.
  await expect(
    page.getByText("Entrevistas com 8 usuários que abandonaram o checkout")
  ).toBeVisible({ timeout: 15_000 });

  await page.goto(hypothesisUrl);
  const after = await readConfidenceScore();
  expect(
    after,
    "Confidence Score deveria aumentar depois de uma evidência real favorável e forte"
  ).toBeGreaterThan(before);
});
