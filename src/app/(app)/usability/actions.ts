"use server";

import { db } from "@/db";
import { usabilityTests, usabilityTestAssets, usabilityTestPersonas, usabilityFindings, personas } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { analyzeUsabilityImage } from "@/lib/ai";
import { nanoid } from "nanoid";
import { ensureBucket, uploadToStorage, getSignedUrl, USABILITY_BUCKET } from "@/lib/supabase-storage";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

// Upload para o Supabase Storage (bucket privado + URL assinada) — ver
// src/lib/supabase-storage.ts. Substitui o antigo armazenamento em disco
// local em /public/uploads, que não funciona em produção serverless.
async function saveUploadedImage(file: File): Promise<{ url: string; base64: string; mediaType: string }> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const filename = `${nanoid(12)}.${ext}`;
  const mediaType = file.type || "image/jpeg";
  await ensureBucket(USABILITY_BUCKET, false);
  await uploadToStorage(USABILITY_BUCKET, filename, buffer, mediaType);
  const url = await getSignedUrl(USABILITY_BUCKET, filename);
  return { url, base64: buffer.toString("base64"), mediaType };
}

// Usados a partir da tela de Hipótese quando um teste de usabilidade ou um
// achado de usabilidade é uma das razões que bloqueiam a exclusão (ver
// checkHypothesisDeletable) — desvinculam sem apagar o registro original.
export async function unlinkHypothesisFromTest(testId: string, hypothesisId: string) {
  const { role } = await getPageContext();
  if (role !== "owner" && role !== "editor") throw new Error("Sem permissão.");
  await db.update(usabilityTests).set({ hypothesisId: null }).where(eq(usabilityTests.id, testId));
  revalidatePath(`/usability/${testId}`);
  revalidatePath(`/hypotheses/${hypothesisId}`);
}

export async function unlinkHypothesisFromFinding(findingId: string, hypothesisId: string) {
  const { role } = await getPageContext();
  if (role !== "owner" && role !== "editor") throw new Error("Sem permissão.");
  await db.update(usabilityFindings).set({ hypothesisId: null }).where(eq(usabilityFindings.id, findingId));
  revalidatePath("/usability", "layout");
  revalidatePath(`/hypotheses/${hypothesisId}`);
}

export async function createUsabilityTest(hypothesisId: string | null, formData: FormData) {
  const { user, project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");

  const file = formData.get("image") as File | null;
  if (!file || file.size === 0) throw new Error("Envie uma imagem.");

  const personaIds = formData.getAll("personaIds").map(String).filter(Boolean);
  if (personaIds.length === 0) throw new Error("Selecione ao menos uma persona.");

  const scenario = String(formData.get("scenario") || "");
  const task = String(formData.get("task") || "");
  const { url, base64, mediaType } = await saveUploadedImage(file);

  const [test] = await db
    .insert(usabilityTests)
    .values({
      projectId: project.id,
      hypothesisId,
      title: String(formData.get("title") || "Teste de usabilidade"),
      scenario,
      task,
      createdBy: user.id,
    })
    .returning();

  await db.insert(usabilityTestAssets).values({
    usabilityTestId: test.id,
    assetType: "image",
    url,
    filename: file.name,
  });
  await db.insert(usabilityTestPersonas).values(personaIds.map((personaId) => ({ usabilityTestId: test.id, personaId })));

  const selectedPersonas = await db.select().from(personas).where(inArray(personas.id, personaIds));

  for (const persona of selectedPersonas) {
    const { data, isMock } = await analyzeUsabilityImage(base64, mediaType, persona, scenario, task);
    const findings: { problem: string; recommendation: string }[] = [];
    if (data.what_is_confusing) findings.push({ problem: data.what_is_confusing, recommendation: "Revisar clareza deste elemento." });
    for (const f of data.friction_points ?? []) findings.push({ problem: f, recommendation: "Reduzir fricção neste ponto do fluxo." });
    for (const f of data.accessibility_issues ?? []) findings.push({ problem: f, recommendation: "Corrigir problema de acessibilidade." });
    for (const f of data.trust_reducing_elements ?? []) findings.push({ problem: f, recommendation: "Revisar elemento que reduz confiança." });

    if (findings.length === 0) {
      findings.push({
        problem: data.what_seems_important ? `Ponto de atenção: ${data.what_seems_important}` : "Sem problema relevante identificado nesta simulação.",
        recommendation: "—",
      });
    }

    await db.insert(usabilityFindings).values(
      findings.map((f) => ({
        usabilityTestId: test.id,
        screenRef: file.name,
        problem: isMock ? `[MODO DEMO] ${f.problem}` : f.problem,
        personaId: persona.id,
        severity: "medium" as const,
        hypothesisId,
        recommendation: f.recommendation,
        humanConfirmed: false,
        originClass: "simulation" as const,
        generatedBy: "ai_generated" as const,
      }))
    );
  }

  revalidatePath("/usability");
  if (hypothesisId) revalidatePath(`/hypotheses/${hypothesisId}`);
  redirect(`/usability/${test.id}`);
}

// Usado a partir da tela de Persona quando um Achado de usabilidade é uma
// das razões que bloqueiam a exclusão (ver checkPersonaDeletable) —
// desvincula sem apagar o achado (ele continua no teste de usabilidade
// original, só solta a persona).
export async function unlinkPersonaFromFinding(findingId: string, personaId: string) {
  const { role } = await getPageContext();
  if (role !== "owner" && role !== "editor") throw new Error("Sem permissão.");
  await db.update(usabilityFindings).set({ personaId: null }).where(eq(usabilityFindings.id, findingId));
  revalidatePath("/usability", "layout");
  revalidatePath(`/personas/${personaId}`);
}

export async function updateFinding(findingId: string, formData: FormData) {
  const { role } = await getPageContext();
  if (role === "viewer") throw new Error("Sem permissão.");
  await db
    .update(usabilityFindings)
    .set({
      severity: String(formData.get("severity") || "medium") as never,
      humanConfirmed: formData.get("humanConfirmed") === "true",
      recommendation: String(formData.get("recommendation") || ""),
    })
    .where(eq(usabilityFindings.id, findingId));
  revalidatePath(`/usability`, "layout");
}
