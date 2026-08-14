import { test, expect } from "@playwright/test";
import { signup, uniqueEmail, fieldByLabel } from "./helpers";

test("cria um roteiro, registra uma entrevista e a transcrição aparece no detalhe", async ({ page }) => {
  test.setTimeout(60_000);
  const email = uniqueEmail("owner-interview");
  await signup(page, { name: "QA Interview Owner", email, password: "SenhaForte123", orgName: "QA Interview Org" });

  await page.goto("/research/interviews/new");
  await fieldByLabel(page, "Título").fill("Roteiro — descoberta de onboarding");
  await page.getByRole("button", { name: "Criar roteiro" }).click();
  await expect(page).toHaveURL(/\/research\/interviews\/[0-9a-f-]{36}$/, { timeout: 15_000 });

  await fieldByLabel(page, "Identificação do entrevistado").fill("P01 - gerente de clínica");
  await fieldByLabel(page, "Transcrição").fill("A entrevistada relatou dificuldade para encontrar o botão de agendar.");
  await page.getByRole("button", { name: "Registrar entrevista" }).click();
  await expect(page).toHaveURL(/\/research\/interviews\/[0-9a-f-]{36}\/interview\/[0-9a-f-]{36}/, {
    timeout: 15_000,
  });
  await expect(
    page.getByText("A entrevistada relatou dificuldade para encontrar o botão de agendar.")
  ).toBeVisible();
});
