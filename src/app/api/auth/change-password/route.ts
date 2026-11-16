import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/current-user";
import { hashPassword, verifyPassword } from "@/lib/auth";

const schema = z.object({
  currentPassword: z.string().min(1, "Informe a senha atual."),
  newPassword: z.string().min(8, "A nova senha precisa de ao menos 8 caracteres."),
});

// Troca de senha de quem está logado. Usada principalmente no primeiro acesso
// com senha temporária (users.must_change_password = true), mas serve para
// qualquer troca voluntária também.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada. Entre de novo." }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Dados inválidos" }, { status: 400 });
  }
  const { currentPassword, newPassword } = parsed.data;

  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    return NextResponse.json({ error: "A senha atual (temporária) está incorreta." }, { status: 400 });
  }
  if (newPassword === currentPassword) {
    return NextResponse.json({ error: "A nova senha precisa ser diferente da temporária." }, { status: 400 });
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(newPassword), mustChangePassword: false })
    .where(eq(users.id, user.id));

  return NextResponse.json({ ok: true });
}
