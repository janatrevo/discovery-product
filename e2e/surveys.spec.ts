import { test, expect } from "@playwright/test";
import { signup, uniqueEmail, fieldByLabel } from "./helpers";

test("cria um survey, adiciona uma pergunta e ela aparece no questionário", async ({ page }) => {
  test.setTimeout(60_000);
  const email = uniqueEmail("owner-survey");
  await signup(page, { name: "QA Survey Owner", email, password: "SenhaForte123", orgName: "QA Survey Org" });

  await page.goto("/research/surveys/new");
  await fieldByLabel(page, "Título").fill("Pesquisa de satisfação — onboarding");
  await page.getByRole("button", { name: "Criar e montar questionário" }).click();
  await expect(page).toHaveURL(/\/research\/surveys\/[0-9a-f-]{36}/, { timeout: 15_000 });

  await fieldByLabel(page, "Texto da pergunta").fill("O quanto o cadastro foi fácil de completar?");
  await page.getByRole("button", { name: "+ Adicionar pergunta" }).click();
  await expect(page.getByText("O quanto o cadastro foi fácil de completar?")).toBeVisible({ timeout: 10_000 });
});
