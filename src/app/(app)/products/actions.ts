"use server";

import { db } from "@/db";
import { products, simulationRuns, personas } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { linesToArray } from "@/lib/list-utils";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

function readForm(formData: FormData) {
  return {
    name: String(formData.get("name") || ""),
    description: String(formData.get("description") || ""),
    category: String(formData.get("category") || ""),
    problemSolved: String(formData.get("problemSolved") || ""),
    targetAudience: String(formData.get("targetAudience") || ""),
    valueProposition: String(formData.get("valueProposition") || ""),
    price: String(formData.get("price") || ""),
    businessModel: String(formData.get("businessModel") || ""),
    version: String(formData.get("version") || "v1"),
    features: linesToArray(formData.get("features")),
    benefits: linesToArray(formData.get("benefits")),
    differentiators: linesToArray(formData.get("differentiators")),
    limitations: linesToArray(formData.get("limitations")),
    competitors: linesToArray(formData.get("competitors")),
  };
}

export async function createProduct(formData: FormData) {
  const { user, project, role } = await getPageContext();
  if (role === "viewer") throw new Error("Viewers não podem criar produtos.");
  const [created] = await db
    .insert(products)
    .values({ ...readForm(formData), projectId: project.id, createdBy: user.id })
    .returning();
  revalidatePath("/products");
  redirect(`/products/${created.id}`);
}

export async function updateProduct(productId: string, formData: FormData) {
  const { role } = await getPageContext();
  if (role === "viewer") throw new Error("Viewers não podem editar produtos.");
  await db.update(products).set(readForm(formData)).where(eq(products.id, productId));
  revalidatePath(`/products/${productId}`);
  redirect(`/products/${productId}`);
}

// Exclui o produto. Simulações dele são apagadas junto; personas só são
// desvinculadas (continuam existindo, sem produto). Vínculos com hipóteses
// caem em cascata. Tudo numa transação.
export async function deleteProduct(productId: string) {
  const { project, role } = await getPageContext();
  if (role !== "owner" && role !== "editor") throw new Error("Sem permissão para excluir.");

  const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!product || product.projectId !== project.id) throw new Error("Produto não encontrado.");

  await db.transaction(async (tx) => {
    await tx.delete(simulationRuns).where(eq(simulationRuns.productId, productId));
    await tx.update(personas).set({ productId: null }).where(eq(personas.productId, productId));
    await tx.delete(products).where(eq(products.id, productId));
  });

  revalidatePath("/products");
  revalidatePath("/personas");
  revalidatePath("/simulations");
  redirect("/products");
}
