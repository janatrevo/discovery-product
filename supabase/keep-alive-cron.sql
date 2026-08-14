-- Evita que o projeto Supabase (plano free) seja pausado por inatividade.
--
-- O plano free do Supabase pausa automaticamente projetos com baixa
-- atividade ao longo de 7 dias seguidos (consultas ao banco, chamadas de
-- API e acessos ao painel contam como atividade). A única solução
-- "oficial" da própria Supabase é migrar para o plano Pro (que nunca
-- pausa) — isso aqui é um contorno: uma consulta real e trivial, agendada
-- todo dia, que conta como atividade e mantém o projeto ativo enquanto
-- vocês não precisarem do Pro.
--
-- Como usar: cole este arquivo inteiro no SQL Editor do painel do Supabase
-- (Database -> SQL Editor -> New query) e rode uma vez. Não precisa repetir.

-- 1) Habilita a extensão de agendamento (equivalente ao cron do Linux, só
--    que dentro do próprio Postgres).
create extension if not exists pg_cron;

-- 2) Agenda uma leitura real (não é um "select 1" vazio) na tabela
--    `projects`, todos os dias à meia-noite UTC.
select cron.schedule(
  'trevo-keep-alive',
  '0 0 * * *',
  $$select count(*) from public.projects;$$
);

-- Para conferir que o job foi criado e ver o histórico de execuções:
--   select * from cron.job;
--   select * from cron.job_run_details order by start_time desc limit 10;

-- Para remover o job no futuro (por exemplo, se migrarem para o plano Pro,
-- que não pausa por inatividade e torna isso desnecessário):
--   select cron.unschedule('trevo-keep-alive');
