"use server";

import { db } from "@/db";
import { projects, projectMemberships } from "@/db/schema";
import { getCurrentUser } from "@/lib/current-user";
import { setCurrentProjectCookie } from "@/lib/current-project";
import { redirect } from "next/navigation";

export async function createProject(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Não autenticado.");
  const name = String(formData.get("name") || "");
  const description = String(formData.get("description") || "");
  if (!name) throw new Error("Nome obrigatório.");

  const [project] = await db.insert(projects).values({ name, description, createdBy: user.id }).returning();
  await db.insert(projectMemberships).values({ projectId: project.id, userId: user.id, role: "owner" });
  await setCurrentProjectCookie(project.id);
  redirect("/dashboard");
}
