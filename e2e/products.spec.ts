import { test, expect } from "@playwright/test";
import { signup, uniqueEmail, fieldByLabel } from "./helpers";

test("cria um produto/conceito e ele aparece na lista", async ({ page }) => {
  test.setTimeout(60_000);
  const email = uniqueEmail("owner-product");
  await signup(page, { name: "QA Product Owner", email, password: "SenhaForte123", orgName: "QA Product Org" });

  await page.goto("/products/new");
  await fieldByLabel(page, "Nome").fill("App de agendamento de consultas");
  await page.getByRole("button", { name: "Criar" }).click();
  await expect(page).toHaveURL(/\/products\/[0-9a-f-]{36}/, { timeout: 15_000 });
  // getByText pega dois elementos aqui: o <h1> da página e o "route
  // announcer" de acessibilidade do Next.js (div oculta que anuncia o
  // título da página para leitores de tela) — específico ao heading evita
  // o "strict mode violation" do Playwright.
  await expect(page.getByRole("heading", { name: "App de agendamento de consultas" })).toBeVisible();

  await page.goto("/products");
  await expect(page.getByText("App de agendamento de consultas")).toBeVisible();
});
