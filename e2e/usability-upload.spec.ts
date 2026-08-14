import { test, expect } from "@playwright/test";
import { signup, uniqueEmail, fieldByLabel } from "./helpers";

// PNG 1x1 válido gerado inline — evita depender de um arquivo fixture no repo.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test("upload de imagem em teste de usabilidade vai para o Supabase Storage (não disco local) e gera achado", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const email = uniqueEmail("owner-usab");
  await signup(page, { name: "QA Usab Owner", email, password: "SenhaForte123", orgName: "QA Usab Org" });

  await page.goto("/personas/new");
  await fieldByLabel(page, "Nome").fill("Persona QA Usabilidade");
  await page.getByRole("button", { name: "Criar persona" }).click();
  await expect(page).toHaveURL(/\/personas\/[0-9a-f-]{36}/, { timeout: 15_000 });

  await page.goto("/usability/new");
  await fieldByLabel(page, "Título").fill("Tela de agendamento — teste QA");
  await page.setInputFiles('input[name="image"]', {
    name: "tela-teste.png",
    mimeType: "image/png",
    buffer: Buffer.from(TINY_PNG_BASE64, "base64"),
  });
  const personaSelect = page.locator('select[name="personaIds"]');
  const firstValue = await personaSelect.locator("option").first().getAttribute("value");
  await personaSelect.selectOption(firstValue!);
  await fieldByLabel(page, "Cenário").fill("Primeira vez usando o app para agendar consulta.");
  await fieldByLabel(page, "Tarefa").fill("Encontrar e agendar uma consulta disponível.");
  await page.getByRole("button", { name: "Analisar com IA" }).click();

  await expect(page).toHaveURL(/\/usability\/[0-9a-f-]{36}/, { timeout: 30_000 });

  // Não usar page.locator("img").first() — a primeira <img> da página é a
  // logo da Trevo no sidebar, não a imagem do teste de usabilidade.
  const img = page.locator('img[alt="tela-teste.png"]');
  await expect(img).toBeVisible({ timeout: 15_000 });
  const src = await img.getAttribute("src");
  expect(
    src,
    `a imagem deveria vir de uma URL assinada do Supabase Storage, veio: ${src}`
  ).toMatch(/supabase\.co\/storage\/v1\/object\/sign\//);
});
