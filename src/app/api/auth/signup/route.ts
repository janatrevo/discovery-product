import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users, organizations, projects, projectMemberships } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, createSessionToken, setSessionCookie } from "@/lib/auth";

const schema = z.object({
  name: z.string().min(2, "Nome muito curto"),
  email: z.string().email("E-mail inválido"),
  password: z.string().min(8, "Senha precisa de ao menos 8 caracteres"),
  orgName: z.string().min(2, "Nome da organização muito curto"),
});

// Cadastro público desativado em produção — a ferramenta é interna agora, e
// só administradores (papel "owner") podem trazer gente nova, via convite
// em Settings (ver src/app/(app)/settings/actions.ts). A rota continua ativa
// fora de produção porque o helper signup() do e2e/helpers.ts depende dela
// para criar a conta de cada teste (rodando contra `npm run dev`, nunca
// contra um build de produção).
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Cadastro público desativado. Peça um convite a um administrador." },
      { status: 403 }
    );
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const { name, email, password, orgName } = parsed.data;

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    return NextResponse.json({ error: "Já existe uma conta com este e-mail." }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const [user] = await db.insert(users).values({ name, email, passwordHash }).returning();
  const [org] = await db.insert(organizations).values({ name: orgName }).returning();

  // Onboarding: já cria um primeiro projeto para reduzir fricção (Fluxo 1 do
  // documento fica disponível para criar projetos adicionais depois).
  const [project] = await db
    .insert(projects)
    .values({
      organizationId: org.id,
      name: "Meu primeiro projeto",
      description: "Projeto criado automaticamente no onboarding — renomeie ou crie outros em Settings.",
      createdBy: user.id,
    })
    .returning();
  await db.insert(projectMemberships).values({
    projectId: project.id,
    userId: user.id,
    role: "owner",
  });

  const token = await createSessionToken(user.id);
  await setSessionCookie(token);

  return NextResponse.json({ ok: true, userId: user.id });
}
