/**
 * Habilita Row Level Security (RLS) em todas as tabelas do schema "public"
 * que ainda não têm — resolve os erros "RLS Disabled in Public" do Security
 * Advisor do Supabase (41 tabelas, ou seja: todas as tabelas do schema).
 *
 * Por que isso é seguro pra este app: o discovery-app nunca lê/escreve
 * dados de negócio pela API REST (PostgREST) do Supabase — toda a
 * autorização já vive na própria aplicação (getPageContext + checagem de
 * role em cada action), e o acesso ao banco é sempre via conexão direta
 * Postgres (DATABASE_URL, Drizzle/postgres.js). O que o Security Advisor
 * está avisando é outra porta: qualquer tabela em "public" sem RLS fica
 * acessível pela API REST do Supabase (https://<projeto>.supabase.co/rest/v1/...)
 * pra quem tiver a anon key — mesmo que a aplicação não use essa porta.
 * Habilitar RLS SEM nenhuma policy fecha exatamente essa porta (API REST
 * passa a negar tudo por padrão) sem afetar em nada a conexão direta que
 * o app usa — CONTANTO que o role da conexão tenha BYPASSRLS (é o caso do
 * role "postgres" padrão do Supabase). Por segurança, o script confere isso
 * antes de mexer em qualquer coisa e aborta se não tiver.
 *
 * Sempre roda em modo "dry run" (só lista o que seria feito) a não ser que
 * você passe --confirmar.
 *
 * Uso:
 *   node --env-file-if-exists=.env.local --import tsx scripts/enable-rls.ts
 *   node --env-file-if-exists=.env.local --import tsx scripts/enable-rls.ts --confirmar
 */
import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function main() {
  const confirm = process.argv.includes("--confirmar");

  const roleCheck = (await db.execute(sql`
    select current_user as current_user,
           (select rolbypassrls from pg_roles where rolname = current_user) as bypassrls
  `)) as unknown as { current_user: string; bypassrls: boolean }[];
  const { current_user: currentUser, bypassrls } = roleCheck[0];

  console.log(`Conectado como role "${currentUser}" — BYPASSRLS: ${bypassrls ? "sim" : "não"}`);

  if (!bypassrls) {
    console.log(
      `\nATENÇÃO: este role NÃO tem BYPASSRLS. Habilitar RLS sem nenhuma policy iria bloquear ` +
        `o próprio discovery-app de ler/escrever essas tabelas, porque ele usa esta mesma conexão. ` +
        `Abortando SEM mudar nada. Use um DATABASE_URL com um role que tenha BYPASSRLS (ex.: "postgres", ` +
        `o padrão do Supabase) antes de rodar este script — ou desenhe policies antes de habilitar RLS.`
    );
    process.exit(1);
  }

  const tables = (await db.execute(sql`
    select tablename from pg_tables where schemaname = 'public' order by tablename
  `)) as unknown as { tablename: string }[];

  const rlsStatus = (await db.execute(sql`
    select c.relname, c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  `)) as unknown as { relname: string; relrowsecurity: boolean }[];
  const rlsByTable = new Map(rlsStatus.map((r) => [r.relname, r.relrowsecurity]));

  const toEnable = tables.filter((t) => !rlsByTable.get(t.tablename));

  console.log(`\nTabelas em public: ${tables.length}`);
  console.log(`Já com RLS habilitada: ${tables.length - toEnable.length}`);
  console.log(`Sem RLS (serão habilitadas): ${toEnable.length}`);
  for (const t of toEnable) console.log(`  - ${t.tablename}`);

  if (!confirm) {
    console.log(`\nMODO DE CONFERÊNCIA (dry run) — nada foi alterado.`);
    console.log(`Se a lista acima está certa, rode de novo adicionando --confirmar no final.`);
    process.exit(0);
  }

  if (toEnable.length === 0) {
    console.log(`\nNada para fazer — todas as tabelas já têm RLS habilitada.`);
    process.exit(0);
  }

  console.log(`\n--confirmar detectado. Habilitando RLS (sem policies) em ${toEnable.length} tabelas...`);
  for (const t of toEnable) {
    await db.execute(sql.raw(`alter table public."${t.tablename}" enable row level security;`));
    console.log(`  habilitado: ${t.tablename}`);
  }

  console.log(
    `\nConcluído. No painel do Supabase, abra Security Advisor e clique em "Rerun linter" pra confirmar que os erros somem.`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Erro:", err.message || err);
    process.exit(1);
  });
