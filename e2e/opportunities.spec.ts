import { test, expect } from "@playwright/test";
import { signup, uniqueEmail, fieldByLabel } from "./helpers";

test.describe("Governança de oportunidades", () => {
  // Regra: uma oportunidade sem hipótese vinculada precisa de uma referência
  // mínima do problema observado — nunca pode ficar sem nenhum lastro.
  test("oportunidade sem hipótese e sem referência do problema é bloqueada", async ({ page }) => {
    test.setTimeout(60_000);
    const email = uniqueEmail("owner-opp-blocked");
    await signup(page, { name: "QA Opp Blocked", email, password: "SenhaForte123", orgName: "QA Opp Blocked Org" });

    await page.goto("/opportunities/new");
    await fieldByLabel(page, "Título").fill("Reduzir fricção no cadastro");
    // Propositalmente não preenche "Referência do problema" nem seleciona hipótese.

    const formUrl = page.url();
    await Promise.all([
      page.waitForResponse((res) => res.url() === formUrl && res.request().method() === "POST"),
      page.getByRole("button", { name: "Mapear oportunidade" }).click(),
    ]);
    await expect(page).toHaveURL(/\/opportunities\/new$/, { timeout: 5_000 });
  });

  test("oportunidade com referência do problema é permitida mesmo sem hipótese", async ({ page }) => {
    test.setTimeout(60_000);
    const email = uniqueEmail("owner-opp-ok");
    await signup(page, { name: "QA Opp Ok", email, password: "SenhaForte123", orgName: "QA Opp Ok Org" });

    await page.goto("/opportunities/new");
    await fieldByLabel(page, "Título").fill("Reduzir fricção no cadastro");
    await fieldByLabel(page, "Referência do problema").fill(
      "3 usuários relataram abandono no cadastro por excesso de campos."
    );
    await page.getByRole("button", { name: "Mapear oportunidade" }).click();
    await expect(page).toHaveURL(/\/opportunities\/[0-9a-f-]{36}/, { timeout: 15_000 });
  });
});
