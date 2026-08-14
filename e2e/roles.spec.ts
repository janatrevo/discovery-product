import { test, expect } from "@playwright/test";
import { signup, login, uniqueEmail, fieldByLabel } from "./helpers";

// Regra: papel "viewer" não pode convidar membros nem editar configurações
// do projeto — a própria UI omite esses controles (ver
// src/app/(app)/settings/page.tsx), não é só o servidor recusando em
// silêncio. Testamos exatamente essa omissão.
test("viewer não vê os controles de edição/convite em Settings", async ({ page }) => {
  test.setTimeout(60_000);
  const ownerEmail = uniqueEmail("owner-roles");
  const viewerEmail = uniqueEmail("viewer-roles");
  const password = "SenhaForte123";

  await signup(page, { name: "QA Roles Owner", email: ownerEmail, password, orgName: "QA Roles Org" });

  // Captura o ID do projeto do owner (via o seletor de projeto no topo) para
  // depois trocar para ele explicitamente como viewer — os dois usuários
  // têm um projeto próprio com o mesmo nome padrão ("Meu primeiro
  // projeto"), então não dá para selecionar pelo texto.
  const ownerProjectId = await page.locator("header select").locator("option").first().getAttribute("value");
  expect(ownerProjectId).toBeTruthy();

  // Precisa existir uma conta antes de poder ser convidada (regra do MVP).
  await page.getByRole("button", { name: "Sair" }).click();
  await signup(page, { name: "QA Roles Viewer", email: viewerEmail, password, orgName: "QA Roles Viewer Org" });
  await page.getByRole("button", { name: "Sair" }).click();

  await login(page, ownerEmail, password);
  await page.goto("/settings");
  // Este formulário específico não usa o wrapper <Field> (mb-3) do resto do
  // app — usa <div className="flex-1"/"w-40"> direto — então os atributos
  // name= são o seletor certo aqui, não fieldByLabel.
  await page.locator('input[name="email"]').fill(viewerEmail);
  await page.locator('select[name="role"]').selectOption("viewer");
  await page.getByRole("button", { name: "Adicionar" }).click();

  const memberRow = page.locator("li", { hasText: viewerEmail });
  await expect(memberRow.locator("span", { hasText: "viewer" })).toBeVisible();

  await page.getByRole("button", { name: "Sair" }).click();
  await login(page, viewerEmail, password);
  // O troca-projeto do topo chama /api/project/switch de forma assíncrona
  // (onChange) sem que selectOption() espere essa chamada terminar — mesma
  // classe de corrida já vista em login()/addEvidence(). Espera a resposta
  // da troca antes de navegar, senão /settings pode carregar com o projeto
  // errado (o próprio, onde ela é owner, em vez do projeto A como viewer).
  await Promise.all([
    page.waitForResponse((res) => res.url().includes("/api/project/switch") && res.ok()),
    page.locator("header select").selectOption(ownerProjectId!),
  ]);
  await page.goto("/settings");

  // Nem o formulário de convite, nem a edição do nome do projeto, devem
  // estar disponíveis para o viewer.
  await expect(page.locator('input[name="email"]')).toHaveCount(0);
  await expect(page.locator('input[name="name"]')).toBeDisabled();
});
