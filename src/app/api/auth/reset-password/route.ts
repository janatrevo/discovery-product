import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { requestPasswordRecovery } from "@/lib/supabase-admin";

const schema = z.object({ email: z.string().email() });

// Dispara o e-mail de recuperação de senha via Supabase Auth. Retorna
// sempre { ok: true }, mesmo se o e-mail não existir ou o disparo falhar —
// de propósito, para não deixar este endpoint ser usado para descobrir quais
// e-mails têm conta na ferramenta.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: true });
  }

  try {
    const h = await headers();
    const host = h.get("host") || "localhost:3000";
    const proto = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
    const redirectTo = `${proto}://${host}/definir-senha`;
    await requestPasswordRecovery(parsed.data.email.toLowerCase().trim(), redirectTo);
  } catch (err) {
    // Configuração ausente (ex.: Supabase não configurado neste ambiente) —
    // não deixa vazar detalhe nenhum ao cliente, só registra no servidor.
    console.error("Erro ao solicitar recuperação de senha:", err);
  }

  return NextResponse.json({ ok: true });
}
