import { test, expect } from "@playwright/test";
import { signup, uniqueEmail, fieldByLabel } from "./helpers";

test.describe("Governança do log de decisões", () => {
  // Regra: uma decisão precisa referenciar hipótese e/ou evidência — a menos
  // que a pessoa marque explicitamente que está sobrepondo a metodologia
  // recomendada. O log é append-only, então isso não pode ser corrigido depois.
  test("decisão sem hipótese/evidência e sem override é bloqueada", async ({ page }) => {
    test.setTimeout(60_000);
    const email = uniqueEmail("owner-decision-blocked");
    await signup(page, { name: "QA Decision Blocked", email, password: "SenhaForte123", orgName: "QA Decision Blocked Org" });

    await page.goto("/decisions/new");
    await fieldByLabel(page, "O que foi decidido").fill("Vamos priorizar o onboarding simplificado.");
    // Propositalmente não seleciona hipóteses/evidências nem marca o override.

    const formUrl = page.url();
    await Promise.all([
      page.waitForResponse((res) => res.url() === formUrl && res.request().method() === "POST"),
      page.getByRole("button", { name: "Registrar decisão" }).click(),
    ]);
    await expect(page).toHaveURL(/\/decisions\/new$/, { timeout: 5_000 });
  });

  test("decisão sem hipótese/evidência é permitida com override explícito", async ({ page }) => {
    test.setTimeout(60_000);
    const email = uniqueEmail("owner-decision-override");
    await signup(page, { name: "QA Decision Override", email, password: "SenhaForte123", orgName: "QA Decision Override Org" });

    await page.goto("/decisions/new");
    await fieldByLabel(page, "O que foi decidido").fill("Vamos priorizar o onboarding simplificado.");
    await page.locator('input[name="overriddenMethodology"]').check();
    await page.getByRole("button", { name: "Registrar decisão" }).click();
    await expect(page).toHaveURL(/\/decisions\/[0-9a-f-]{36}/, { timeout: 15_000 });
  });
});
