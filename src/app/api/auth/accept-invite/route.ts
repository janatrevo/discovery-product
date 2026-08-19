import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users, projects, projectMemberships } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, createSessionToken, setSessionCookie } from "@/lib/auth";
import { verifySupabaseAccessToken } from "@/lib/supabase-admin";

const schema = z.object({
  accessToken: z.string().min(10),
  name: z.string().min(2, "Nome muito curto").optional(),
  password: z.string().min(8, "Senha precisa de ao menos 8 caracteres"),
  // Distingue convite (concede acesso a projeto) de recuperação de senha
  // (só troca a senha, nunca mexe em project_memberships). `undefined` cai no
  // comportamento legado de convite, para compatibilidade com o link gerado
  // por scripts/invite-user.ts (que não passa "type" nenhum).
  type: z.enum(["invite", "recovery", "signup"]).optional(),
});

const ROLES = ["owner", "editor", "contributor", "viewer"] as const;
type Role = (typeof ROLES)[number];
function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

// Fecha o link enviado via Supabase Auth (ver src/lib/supabase-admin.ts) —
// tanto o de convite quanto o de "esqueci minha senha" caem aqui, com
// `type` diferenciando os dois. Confirma o token assinado pelo Supabase e
// atualiza/cria o usuário no nosso próprio sistema de auth (users.password_hash).
//
// Concessão de acesso a projeto SÓ acontece em convite de verdade — nunca
// numa recuperação de senha. Convites disparados pela tela de Settings (ver
// src/app/(app)/settings/actions.ts) já vêm com projectId/role específicos
// no user_metadata; na ausência deles (convites antigos via
// scripts/invite-user.ts), mantemos o comportamento legado de conceder
// "owner" em todos os projetos, já que aquele script é só para o bootstrap
// do primeiro administrador.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Dados inválidos" }, { status: 400 });
  }
  const { accessToken, name, password, type } = parsed.data;

  let email: string;
  let userMetadata: Record<string, unknown> = {};
  try {
    const claims = await verifySupabaseAccessToken(accessToken);
    email = claims.email.toLowerCase().trim();
    userMetadata = claims.user_metadata ?? {};
  } catch {
    return NextResponse.json({ error: "Link inválido ou expirado. Peça um novo convite." }, { status: 401 });
  }

  const passwordHash = await hashPassword(password);
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (type === "recovery" && !existing) {
    // Não deveria acontecer (recuperação pressupõe conta existente), mas por
    // segurança não cria conta nova a partir de um link de recuperação.
    return NextResponse.json({ error: "Link inválido ou expirado. Peça um novo convite." }, { status: 401 });
  }

  const user = existing
    ? (
        await db
          .update(users)
          .set({ passwordHash, ...(name ? { name } : {}) })
          .where(eq(users.id, existing.id))
          .returning()
      )[0]
    : (await db.insert(users).values({ email, name: name ?? email.split("@")[0], passwordHash }).returning())[0];

  if (type !== "recovery") {
    const metaProjectId = typeof userMetadata.projectId === "string" ? userMetadata.projectId : null;
    const metaRole = isRole(userMetadata.role) ? userMetadata.role : "contributor";

    if (metaProjectId) {
      await db
        .insert(projectMemberships)
        .values({ projectId: metaProjectId, userId: user.id, role: metaRole })
        .onConflictDoUpdate({
          target: [projectMemberships.projectId, projectMemberships.userId],
          set: { role: metaRole },
        });
    } else {
      // Compat legado: convite sem projectId/role no metadata (ex.:
      // scripts/invite-user.ts) — concede owner em todos os projetos, como
      // sempre funcionou para o bootstrap do primeiro administrador.
      const allProjects = await db.select({ id: projects.id }).from(projects);
      for (const p of allProjects) {
        await db
          .insert(projectMemberships)
          .values({ projectId: p.id, userId: user.id, role: "owner" })
          .onConflictDoUpdate({
            target: [projectMemberships.projectId, projectMemberships.userId],
            set: { role: "owner" },
          });
      }
    }
  }

  const token = await createSessionToken(user.id);
  await setSessionCookie(token);

  return NextResponse.json({ ok: true });
}
