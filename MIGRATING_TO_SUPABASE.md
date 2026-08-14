# Migrando de Postgres local para Supabase

Este projeto foi construído para rodar contra **qualquer** Postgres via
connection string direta (pacote `postgres` + Drizzle ORM). Isso significa
que a maior parte da migração para Supabase é **trocar uma variável de
ambiente**, não reescrever código. Este documento cobre o que é imediato e o
que exige uma decisão/trabalho extra.

## 1. Banco de dados — imediato

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Em **Project Settings → Database → Connection string**, copie a URI no
   modo **Session** (porta 5432) para migrações/seed, ou **Transaction**
   (porta 6543, via pgbouncer) para a aplicação em produção/serverless.
3. Defina `DATABASE_URL` no ambiente (local: `.env.local`; produção: variáveis
   de ambiente do Vercel) com essa connection string.
4. Rode as migrations contra o banco do Supabase:
   ```bash
   npx drizzle-kit migrate
   ```
   (As migrations em `supabase/migrations/` foram geradas pelo Drizzle Kit e
   são SQL puro — funcionam em qualquer Postgres, inclusive aplicando pelo
   próprio painel do Supabase em SQL Editor, se preferir.)
5. Rode o seed de dados demo (opcional, útil para validar o deploy):
   ```bash
   npx tsx scripts/seed.ts
   ```
   **Atenção:** o seed é destrutivo (`TRUNCATE ... CASCADE` em todo o banco).
   Só rode contra um projeto Supabase vazio ou de staging.

Depois disso, a aplicação já funciona 100% contra o Supabase — nenhuma
mudança de código é necessária para o CRUD, autenticação por sessão própria,
ou os módulos de IA.

## 2. Upload de arquivos — Storage (requer código)

Hoje, imagens de teste de usabilidade são salvas em disco local
(`public/uploads/usability/`, ver `src/app/(app)/usability/actions.ts`,
função `saveUploadedImage`). Isso **não funciona em produção serverless**
(Vercel não tem disco persistente) — é o item mais urgente antes de um
deploy real com uploads.

Passos:
1. No Supabase, crie um bucket (ex.: `usability-assets`), público ou com
   signed URLs conforme sua política de privacidade de dados de saúde/PII.
2. Troque `saveUploadedImage` em `usability/actions.ts` para usar
   `@supabase/supabase-js` (`supabase.storage.from(bucket).upload(...)`) em
   vez de `fs/promises`. A função já retorna `{ url, base64, mediaType }` —
   mantenha essa assinatura para não precisar tocar no restante do fluxo
   (o `base64` é usado para enviar a imagem à Anthropic API).
3. Repita o mesmo padrão para `product_assets` quando a UI de upload de
   assets de produto for implementada (hoje só o schema existe).

## 3. Autenticação — Supabase Auth (opcional, decisão de produto)

A autenticação atual é própria: bcrypt + JWT (jose) + cookie httpOnly
(`src/lib/auth.ts`). Isso funciona perfeitamente contra Supabase Postgres
sem nenhuma mudança — **migrar para Supabase Auth não é necessário para
usar Supabase como banco**.

Migre para Supabase Auth apenas se você quiser: login social (Google, etc.),
magic links, ou não manter a lógica de hashing/sessão você mesmo. Se decidir
migrar:

1. Configure Supabase Auth no painel e instale `@supabase/ssr`.
2. A tabela `users` deste projeto passaria a referenciar `auth.users.id` em
   vez de manter `password_hash` localmente (dropar essa coluna).
3. Toda a lógica de **autorização por projeto** (papéis `owner` / `editor` /
   `contributor` / `viewer` em `project_memberships`, ver
   `src/lib/current-project.ts` → `assertMinRole`) é independente da
   autenticação e **não precisa mudar** — ela já modela isso como dados,
   não como lógica de sessão.

## 4. Row Level Security (RLS) — recomendado antes de produção real

Hoje, o isolamento entre projetos/organizações é garantido **na camada de
aplicação** (toda query do Server Action já filtra por `project.id`, obtido
via `getPageContext()` → `requireCurrentProject`). Isso é seguro enquanto
todo acesso ao banco passar pela aplicação Next.js.

Se você expuser este banco a qualquer client-side direto (ex.: usar o client
JS do Supabase no browser para leituras), **RLS passa a ser obrigatório**,
porque nesse cenário o browser fala direto com o Postgres via API do
Supabase, sem passar pelos Server Actions que hoje fazem esse filtro.

Policy de referência para as tabelas com `project_id` (adapte para cada
tabela; o padrão é o mesmo):

```sql
alter table hypotheses enable row level security;

create policy "members can select project hypotheses"
  on hypotheses for select
  using (
    exists (
      select 1 from project_memberships pm
      where pm.project_id = hypotheses.project_id
        and pm.user_id = auth.uid()
    )
  );

create policy "editors+ can modify project hypotheses"
  on hypotheses for all
  using (
    exists (
      select 1 from project_memberships pm
      where pm.project_id = hypotheses.project_id
        and pm.user_id = auth.uid()
        and pm.role in ('owner', 'editor', 'contributor')
    )
  );
```

Repita para: `personas`, `products`, `evidence`, `experiments`, `surveys`,
`interview_guides`, `usability_tests`, `simulation_runs`, `opportunities`,
`decisions`, `reports`, e as tabelas filhas via join na tabela pai.
Isso só é necessário se `auth.uid()` existir — ou seja, depende do item 3
(migrar para Supabase Auth) para funcionar, já que a autenticação própria
atual não popula `auth.uid()`.

## 5. Variáveis de ambiente no Vercel

No painel do projeto Vercel: **Settings → Environment Variables**, adicione:

| Variável | Onde conseguir |
|---|---|
| `DATABASE_URL` | Supabase → Database → Connection string (modo Transaction/pgbouncer para produção serverless) |
| `AUTH_SECRET` | Gere um valor aleatório forte (`openssl rand -base64 32`) — **diferente** do valor de desenvolvimento |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) — opcional; sem ela, os módulos de IA continuam funcionando em modo demo |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Necessários apenas se/quando migrar Storage (item 2) ou Auth (item 3) |

## O que não precisa de migração

- Toda a lógica de negócio (Confidence Score, motor de status, detector de
  viés, governança de proveniência `origin_class`/`generated_by`) vive em
  `src/lib/` como funções puras/Server Actions — zero acoplamento a
  Postgres local vs. Supabase.
- O schema Drizzle (`src/db/schema.ts`) já é o schema real do Supabase depois
  do passo 1 — não há um "schema de dev" diferente do "schema de produção".
