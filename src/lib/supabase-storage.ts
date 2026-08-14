// Upload de arquivos para o Supabase Storage via API REST (mesmo padrão do
// src/lib/supabase-admin.ts — usa a service_role key, só no servidor, nunca
// no client). Bucket PRIVADO por padrão: as imagens de teste de usabilidade
// podem conter telas de um produto de saúde, então geramos URLs assinadas
// em vez de deixar o bucket público (ver MIGRATING_TO_SUPABASE.md, item 2).

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const USABILITY_BUCKET = "usability-assets";

function assertConfigured() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error(
      "Supabase Storage não configurado — defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local."
    );
  }
}

const ensured = new Set<string>();

// Cria o bucket na primeira vez que for usado (idempotente — não falha se já existir).
export async function ensureBucket(bucket: string, isPublic = false) {
  if (ensured.has(bucket)) return;
  assertConfigured();
  const check = await fetch(`${SUPABASE_URL}/storage/v1/bucket/${bucket}`, {
    headers: { apikey: SERVICE_ROLE_KEY!, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  });
  if (check.status === 200) {
    ensured.add(bucket);
    return;
  }
  const create = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ id: bucket, name: bucket, public: isPublic }),
  });
  if (!create.ok) {
    const body = await create.json().catch(() => ({}));
    throw new Error(body?.message || `Falha ao criar bucket "${bucket}" (HTTP ${create.status}).`);
  }
  ensured.add(bucket);
}

export async function uploadToStorage(bucket: string, path: string, buffer: Buffer, contentType: string) {
  assertConfigured();
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": contentType,
    },
    body: buffer,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message || `Falha ao enviar arquivo para o Storage (HTTP ${res.status}).`);
  }
}

// Gera uma URL temporária de leitura (bucket é privado). Duração padrão: 60
// dias — suficiente para o ciclo de vida de um teste de usabilidade; se
// precisar de links permanentes, considere tornar o bucket público.
export async function getSignedUrl(bucket: string, path: string, expiresInSeconds = 60 * 60 * 24 * 60) {
  assertConfigured();
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${bucket}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ expiresIn: expiresInSeconds }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.signedURL) {
    throw new Error(body?.message || `Falha ao gerar URL assinada (HTTP ${res.status}).`);
  }
  return `${SUPABASE_URL}/storage/v1${body.signedURL}`;
}
