"use server";

import { db } from "@/db";
import { projects, projectMemberships, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { revalidatePath } from "next/cache";

export async function updateThresholds(formData: FormData) {
  const { project, role } = await getPageContext();
  if (role !== "owner") throw new Error("Só o Owner pode alterar limiares do projeto.");
  await db
    .update(projects)
    .set({
      confidenceValidatedThreshold: Number(formData.get("confidenceValidatedThreshold") || 70),
      minSampleSurvey: Number(formData.get("minSampleSurvey") || 30),
      minSampleInterview: Number(formData.get("minSampleInterview") || 5),
      name: String(formData.get("name") || project.name),
      description: String(formData.get("description") || ""),
    })
    .where(eq(projects.id, project.id));
  revalidatePath("/settings");
}

export async function inviteMember(formData: FormData) {
  const { project, role } = await getPageContext();
  if (role !== "owner" && role !== "editor") throw new Error("Sem permissão para convidar membros.");
  const email = String(formData.get("email") || "").toLowerCase().trim();
  const memberRole = String(formData.get("role") || "contributor") as
    | "owner"
    | "editor"
    | "contributor"
    | "viewer";

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    throw new Error(
      `Não existe conta com o e-mail ${email}. No MVP, a pessoa precisa criar a conta em /signup antes de ser adicionada.`
    );
  }
  const [existing] = await db
    .select()
    .from(projectMemberships)
    .where(and(eq(projectMemberships.projectId, project.id), eq(projectMemberships.userId, user.id)))
    .limit(1);
  if (existing) throw new Error("Este usuário já é membro do projeto.");

  await db.insert(projectMemberships).values({ projectId: project.id, userId: user.id, role: memberRole });
  revalidatePath("/settings");
}

export async function removeMember(userId: string) {
  const { project, role, user } = await getPageContext();
  if (role !== "owner") throw new Error("Só o Owner pode remover membros.");

  // Nunca deixar o projeto sem nenhum Owner — isso derrubava a própria conta
  // de quem removia (inclusive removendo a si mesmo), travando o acesso ao
  // projeto inteiro sem nenhuma forma de desfazer pela própria aplicação.
  const members = await db
    .select()
    .from(projectMemberships)
    .where(eq(projectMemberships.projectId, project.id));
  const target = members.find((m) => m.userId === userId);
  if (!target) throw new Error("Este usuário não é membro do projeto.");

  const remainingOwners = members.filter((m) => m.role === "owner" && m.userId !== userId);
  if (target.role === "owner" && remainingOwners.length === 0) {
    throw new Error(
      "Não é possível remover o último Owner do projeto — promova outro membro a Owner antes de remover este."
    );
  }
  if (userId === user.id && members.length === 1) {
    throw new Error("Não é possível remover o único membro do projeto (você mesmo).");
  }

  await db
    .delete(projectMemberships)
    .where(and(eq(projectMemberships.projectId, project.id), eq(projectMemberships.userId, userId)));
  revalidatePath("/settings");
}
