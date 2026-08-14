import { test, expect } from "@playwright/test";
import { signup, uniqueEmail, fieldByLabel } from "./helpers";

test("cria uma persona sintética e ela aparece na lista", async ({ page }) => {
  test.setTimeout(60_000);
  const email = uniqueEmail("owner-persona");
  await signup(page, { name: "QA Persona Owner", email, password: "SenhaForte123", orgName: "QA Persona Org" });

  await page.goto("/personas/new");
  await fieldByLabel(page, "Nome").fill("Marina, gerente de clínica");
  // Origem fica "Sintética" por padrão — não deveria exigir fonte.
  await page.getByRole("button", { name: "Criar persona" }).click();
  await expect(page).toHaveURL(/\/personas\/[0-9a-f-]{36}/, { timeout: 15_000 });

  await page.goto("/personas");
  await expect(page.getByText("Marina, gerente de clínica")).toBeVisible();
});

// Regra estrutural (já existia antes desta suíte, agora com cobertura): uma
// persona marcada como "research-based" precisa de ao menos uma fonte de
// evidência — não pode alegar ser baseada em pesquisa sem apontar de onde.
test("persona research-based sem nenhuma fonte é bloqueada", async ({ page }) => {
  test.setTimeout(60_000);
  const email = uniqueEmail("owner-persona-blocked");
  await signup(page, { name: "QA Persona Blocked", email, password: "SenhaForte123", orgName: "QA Persona Blocked Org" });

  await page.goto("/personas/new");
  await fieldByLabel(page, "Nome").fill("Carla, enfermeira-chefe");
  await fieldByLabel(page, "Origem").selectOption("research_based");
  // Propositalmente não preenche "Fontes".

  const formUrl = page.url();
  await Promise.all([
    page.waitForResponse((res) => res.url() === formUrl && res.request().method() === "POST"),
    page.getByRole("button", { name: "Criar persona" }).click(),
  ]);
  await expect(page).toHaveURL(/\/personas\/new$/, { timeout: 5_000 });
});
