import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users, projects, projectMemberships } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, createSessionToken, setSessionCookie } from "@/lib/auth";
import { verifySupabaseAccessToken } from "@/lib/supabase-admin";

const schema = z.object({
  accessToken: z.string().min(10),
  name: z.string().min(2, "Nome muito curto"),
  password: z.string().min(8, "Senha precisa de ao menos 8 caracteres"),
});

// Fecha o convite enviado via Supabase Auth (ver src/lib/supabase-admin.ts):
// confirma o token assinado pelo Supabase, cria/atualiza o usuário no nosso
// próprio sistema de auth (users.password_hash), concede papel "owner" em
// todos os projetos existentes (não há papel global de admin no schema —
// só papel por projeto, ver src/lib/current-user.ts) e já abre a sessão.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Dados inválidos" }, { status: 400 });
  }
  const { accessToken, name, password } = parsed.data;

  let email: string;
  try {
    const claims = await verifySupabaseAccessToken(accessToken);
    email = claims.email.toLowerCase().trim();
  } catch {
    return NextResponse.json({ error: "Link inválido ou expirado. Peça um novo convite." }, { status: 401 });
  }

  const passwordHash = await hashPassword(password);
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  const user = existing
    ? (await db.update(users).set({ passwordHash, name }).where(eq(users.id, existing.id)).returning())[0]
    : (await db.insert(users).values({ email, name, passwordHash }).returning())[0];

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

  const token = await createSessionToken(user.id);
  await setSessionCookie(token);

  return NextResponse.json({ ok: true });
}
