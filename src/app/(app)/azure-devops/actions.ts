"use server";

import { getPageContext } from "@/lib/page-context";
import { createFeature, updateFeature, deleteFeature } from "@/lib/azure-devops";
import { linesToArray } from "@/lib/list-utils";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

// Só administradores (Owner) podem mexer nos cards do board — mesma régua
// aplicada aos convites de membro (ver src/app/(app)/settings/actions.ts).
// Isto é intencionalmente mais restrito que o resto do app (que geralmente
// libera Editor também) porque o board Azure DevOps é compartilhado com times
// fora do discovery-app — só quem já administra o projeto aqui deveria poder
// criar/editar/excluir cards de verdade no board da empresa.
function assertOwner(role: string) {
  if (role !== "owner") throw new Error("Só administradores (Owner) podem gerenciar Features no Azure DevOps.");
}

export async function createAzureFeature(formData: FormData) {
  const { role } = await getPageContext();
  assertOwner(role);

  const title = String(formData.get("title") || "");
  const description = String(formData.get("description") || "");
  const tags = linesToArray(formData.get("tags"));

  const created = await createFeature({ title, description, tags });
  revalidatePath("/azure-devops");
  redirect(`/azure-devops/${created.id}/edit`);
}

export async function updateAzureFeature(id: number, formData: FormData) {
  const { role } = await getPageContext();
  assertOwner(role);

  const title = String(formData.get("title") || "");
  const description = String(formData.get("description") || "");
  const tags = linesToArray(formData.get("tags"));
  const state = String(formData.get("state") || "");

  await updateFeature(id, { title, description, tags, state: state || undefined });
  revalidatePath("/azure-devops");
  redirect("/azure-devops");
}

export async function deleteAzureFeature(id: number) {
  const { role } = await getPageContext();
  assertOwner(role);

  await deleteFeature(id);
  revalidatePath("/azure-devops");
  redirect("/azure-devops");
}
