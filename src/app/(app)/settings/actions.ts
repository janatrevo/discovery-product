"use server";

import { db } from "@/db";
import { projects, projectMemberships, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { inviteUserByEmail } from "@/lib/supabase-admin";

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

// Só Owner (o "administrador" do projeto — não existe papel global no
// schema, ver src/lib/current-user.ts) pode convidar gente nova, agora que a
// ferramenta é interna e o cadastro público em /signup foi desativado em
// produção (ver src/app/api/auth/signup/route.ts).
export async function inviteMember(formData: FormData) {
  const { project, role } = await getPageContext();
  if (role !== "owner") throw new Error("Só administradores (Owner) podem convidar membros.");
  const email = String(formData.get("email") || "").toLowerCase().trim();
  const memberRole = String(formData.get("role") || "contributor") as
    | "owner"
    | "editor"
    | "contributor"
    | "viewer";

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (!user) {
    // Pessoa ainda não tem conta na ferramenta: dispara um convite de
    // verdade por e-mail via Supabase Auth (mesmo "carteiro" usado por
    // scripts/invite-user.ts), já carregando o projeto e o papel escolhidos
    // aqui no metadata — accept-invite usa isso para conceder acesso só a
    // este projeto, no papel certo (não "owner em tudo").
    const h = await headers();
    const host = h.get("host") || "localhost:3000";
    const proto = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
    await inviteUserByEmail(email, {
      redirectTo: `${proto}://${host}/definir-senha`,
      data: { projectId: project.id, role: memberRole },
    });
    revalidatePath("/settings");
    return;
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
