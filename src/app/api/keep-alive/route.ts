import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

// Ping diário no banco para o projeto Supabase (plano gratuito) não ser
// pausado por inatividade. Chamado pelo Vercel Cron (ver vercel.json), que
// envia automaticamente "Authorization: Bearer <CRON_SECRET>" quando a
// variável CRON_SECRET existe no projeto da Vercel.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET não configurada." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }

  try {
    // Consulta real pela mesma conexão que o app usa.
    await db.execute(sql`select 1`);
  } catch (e) {
    console.error("keep-alive: falha ao consultar o banco:", e);
    return NextResponse.json({ ok: false, error: "Falha ao consultar o banco." }, { status: 500 });
  }

  // Opcional: registra o ping na tabela public.keep_alive (criada pelo SQL do
  // Supabase). Se a função ainda não existir, o ping acima já basta.
  let recorded = true;
  try {
    await db.execute(sql`select public.keep_alive_ping()`);
  } catch {
    recorded = false;
  }

  return NextResponse.json({ ok: true, recorded, at: new Date().toISOString() });
}
