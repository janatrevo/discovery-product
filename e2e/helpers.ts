import { Page, expect } from "@playwright/test";

// Todo formulário do app usa os mesmos primitivos (Field > Label + Input),
// sem name/id/htmlFor associados ao label — então localizamos o campo pelo
// texto do label, dentro do wrapper <div className="mb-3"> (Field). Ver
// src/components/ui/primitives.tsx.
export function fieldByLabel(page: Page, labelText: string) {
  return page.locator("div.mb-3").filter({ hasText: labelText }).locator("input, textarea, select").first();
}

export function uniqueEmail(prefix: string) {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@teste.trevo.local`;
}

export type SignupInput = { name: string; email: string; password: string; orgName: string };

// Cria uma conta nova via /signup (cria organização + projeto + já loga).
export async function signup(page: Page, opts: SignupInput) {
  await page.goto("/signup");
  // "Seu nome" e "Nome da organização / time" são os dois únicos campos de
  // texto simples (sem type) da página, nessa ordem no DOM.
  const textInputs = page.locator('input[type="text"], input:not([type])');
  await textInputs.nth(0).fill(opts.name);
  await textInputs.nth(1).fill(opts.orgName);
  await page.locator('input[type="email"]').fill(opts.email);
  await page.locator('input[type="password"]').fill(opts.password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}

export async function login(
  page: Page,
  email: string,
  password: string,
  opts: { expectSuccess?: boolean } = {}
) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  // Só espera o redirect quando o login deveria de fato funcionar — sem
  // isso, quem chama login() esperando sucesso pode navegar para outra
  // página antes do cookie de sessão terminar de ser setado (a chamada é
  // assíncrona). Testes de credencial inválida passam expectSuccess: false.
  if (opts.expectSuccess ?? true) {
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  }
}

export async function logout(page: Page) {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login/);
}
