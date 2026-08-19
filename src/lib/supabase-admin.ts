import { createRemoteJWKSet, jwtVerify } from "jose";

// Integração mínima com a API Admin do Supabase Auth — usada apenas para
// enviar convites de "criar senha" por e-mail (usando o mailer do próprio
// Supabase) e verificar o token do link recebido. O login do dia a dia
// continua sendo o sistema próprio (ver src/lib/auth.ts e
// MIGRATING_TO_SUPABASE.md, item 3) — o Supabase aqui só entra como
// "carteiro" do convite, não como provedor de sessão da aplicação.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWKS_URL = process.env.SUPABASE_JWKS_URL;

function assertConfigured() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error(
      "Supabase Admin não configurado — defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local."
    );
  }
}

export async function inviteUserByEmail(
  email: string,
  opts: { redirectTo?: string; data?: Record<string, unknown> } = {}
) {
  assertConfigured();
  const url = new URL(`${SUPABASE_URL}/auth/v1/invite`);
  if (opts.redirectTo) url.searchParams.set("redirect_to", opts.redirectTo);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ email, data: opts.data ?? {} }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.msg || body?.message || `Falha ao enviar convite (HTTP ${res.status}).`);
  }
  return body;
}

// Dispara o e-mail de "recuperar senha" do próprio Supabase Auth (endpoint
// POST /auth/v1/recover do GoTrue). O link cai na mesma página /definir-senha
// usada pelo convite — o hash da URL vem com type=recovery, e o backend
// (accept-invite) usa esse type para NUNCA mexer em project_memberships numa
// recuperação de senha (só num convite de verdade).
export async function requestPasswordRecovery(email: string, redirectTo?: string) {
  assertConfigured();
  const url = new URL(`${SUPABASE_URL}/auth/v1/recover`);
  if (redirectTo) url.searchParams.set("redirect_to", redirectTo);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ email }),
  });

  // Não lança em caso de e-mail inexistente — a rota que chama esta função
  // sempre retorna uma mensagem genérica ao cliente, para não revelar quais
  // e-mails têm conta (ver src/app/api/auth/reset-password/route.ts).
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("Falha ao solicitar recuperação de senha:", body?.msg || body?.message || res.status);
  }
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (!JWKS_URL) throw new Error("SUPABASE_JWKS_URL não configurada em .env.local.");
  if (!jwks) jwks = createRemoteJWKSet(new URL(JWKS_URL));
  return jwks;
}

export type SupabaseInvitePayload = {
  email: string;
  sub: string;
  user_metadata?: Record<string, unknown>;
};

// Verifica o access_token que vem no link do e-mail de convite do Supabase
// (fragmento #access_token=... da URL de redirect_to). Confirma que foi
// realmente emitido pelo projeto Supabase configurado, e que não expirou.
export async function verifySupabaseAccessToken(token: string): Promise<SupabaseInvitePayload> {
  const { payload } = await jwtVerify(token, getJwks());
  if (!payload.email || typeof payload.email !== "string") {
    throw new Error("Token não contém e-mail.");
  }
  return {
    email: payload.email,
    sub: String(payload.sub),
    user_metadata: (payload.user_metadata as Record<string, unknown>) ?? {},
  };
}
