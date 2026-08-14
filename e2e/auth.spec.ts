import { test, expect } from "@playwright/test";
import { signup, login, uniqueEmail } from "./helpers";

test.describe("Autenticação", () => {
  test("signup cria conta, organização e projeto, e já loga", async ({ page }) => {
    const email = uniqueEmail("owner-auth");
    await signup(page, { name: "QA Auth Owner", email, password: "SenhaForte123", orgName: "QA Auth Org" });
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("login com senha errada mostra erro e não entra", async ({ page }) => {
    const email = uniqueEmail("owner-auth-wrong");
    await signup(page, { name: "QA Wrong Owner", email, password: "SenhaForte123", orgName: "QA Wrong Org" });
    await page.getByRole("button", { name: "Sair" }).click();
    await expect(page).toHaveURL(/\/login/);

    await login(page, email, "SenhaErrada999", { expectSuccess: false });
    await expect(page.getByText(/incorretos|inválid/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("visitar /dashboard deslogado redireciona para /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("logout encerra a sessão de verdade (não só a UI)", async ({ page }) => {
    const email = uniqueEmail("owner-auth-logout");
    await signup(page, { name: "QA Logout Owner", email, password: "SenhaForte123", orgName: "QA Logout Org" });
    await page.getByRole("button", { name: "Sair" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});
