"use server";

import { db } from "@/db";
import { projects, projectMemberships, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getPageContext } from "@/lib/page-context";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { inviteUserByEmail } from "@/lib/supabase-admin";
import { hashPassword } from "@/lib/auth";
import { generateTempPassword } from "@/lib/temp-password";

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

// ---------------------------------------------------------------------------
// Criação de acesso com SENHA TEMPORÁRIA (substitui o convite por e-mail, que
// dependia do envio de e-mail do Supabase e travava em "carregando").
// O Owner cria a pessoa, recebe a senha temporária na tela (uma única vez) e
// repassa por WhatsApp/telefone. No primeiro login, a pessoa é obrigada a
// trocar a senha (users.must_change_password). Erros voltam como mensagem —
// nunca lançam exceção — para a tela nunca ficar presa em "carregando".
// ---------------------------------------------------------------------------

// getPageContext() usa redirect() (que lança NEXT_REDIRECT): sem repassar,
// sessão expirada viraria "erro genérico" em vez de ir para o login.
function rethrowIfRedirect(err: unknown) {
  const digest = (err as { digest?: unknown } | null)?.digest;
  if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) throw err;
}

export type TempPasswordResult =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "created"; name: string; email: string; tempPassword: string; isNewAccount: true }
  | { status: "added"; name: string; email: string; message: string };

export async function createMemberWithTempPassword(
  _prev: TempPasswordResult,
  formData: FormData
): Promise<TempPasswordResult> {
  try {
    const { project, role } = await getPageContext();
    if (role !== "owner") return { status: "error", message: "Só administradores (Owner) podem criar acessos." };

    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").toLowerCase().trim();
    const memberRole = String(formData.get("role") || "contributor");
    if (!["owner", "editor", "contributor", "viewer"].includes(memberRole)) {
      return { status: "error", message: "Papel inválido." };
    }
    if (name.length < 2) return { status: "error", message: "Informe o nome da pessoa." };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { status: "error", message: "E-mail inválido." };
    const roleTyped = memberRole as "owner" | "editor" | "contributor" | "viewer";

    const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);

    if (existing) {
      const [already] = await db
        .select()
        .from(projectMemberships)
        .where(and(eq(projectMemberships.projectId, project.id), eq(projectMemberships.userId, existing.id)))
        .limit(1);
      if (already) return { status: "error", message: "Esta pessoa já é membro do projeto." };
      await db.insert(projectMemberships).values({ projectId: project.id, userId: existing.id, role: roleTyped });
      revalidatePath("/settings");
      return {
        status: "added",
        name: existing.name,
        email,
        message:
          "Esta pessoa já tinha conta, então só foi adicionada ao projeto. A senha dela não mudou — se ela esqueceu, use “gerar nova senha” na lista de membros.",
      };
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);
    await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(users)
        .values({ email, name, passwordHash, mustChangePassword: true })
        .returning();
      await tx.insert(projectMemberships).values({ projectId: project.id, userId: created.id, role: roleTyped });
    });
    revalidatePath("/settings");
    return { status: "created", name, email, tempPassword, isNewAccount: true };
  } catch (err) {
    rethrowIfRedirect(err);
    console.error("createMemberWithTempPassword:", err);
    return {
      status: "error",
      message:
        "Não foi possível criar o acesso. Confira se o SQL usuarios_senha_temporaria.sql já foi rodado no Supabase e tente de novo.",
    };
  }
}

export type ResetPasswordResult =
  | { ok: true; tempPassword: string }
  | { ok: false; message: string };

// Gera uma nova senha temporária para um membro (esqueceu a senha / perdeu o
// papel com a senha). Só Owner, só para membros do projeto atual, nunca para si.
export async function resetMemberPassword(userId: string): Promise<ResetPasswordResult> {
  try {
    const { project, role, user } = await getPageContext();
    if (role !== "owner") return { ok: false, message: "Só administradores (Owner) podem gerar senha." };
    if (userId === user.id) {
      return { ok: false, message: "Para trocar a sua própria senha, use “Esqueci minha senha” na tela de login." };
    }
    const [member] = await db
      .select()
      .from(projectMemberships)
      .where(and(eq(projectMemberships.projectId, project.id), eq(projectMemberships.userId, userId)))
      .limit(1);
    if (!member) return { ok: false, message: "Este usuário não é membro do projeto." };

    const tempPassword = generateTempPassword();
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(tempPassword), mustChangePassword: true })
      .where(eq(users.id, userId));
    revalidatePath("/settings");
    return { ok: true, tempPassword };
  } catch (err) {
    rethrowIfRedirect(err);
    console.error("resetMemberPassword:", err);
    return { ok: false, message: "Não foi possível gerar a senha. Tente de novo." };
  }
}
