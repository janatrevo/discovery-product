-- Calendário do projeto (Trevo One)
-- Rode UMA vez no Supabase: SQL Editor > New query > cole este arquivo inteiro > Run.
-- É seguro rodar de novo: usa "if not exists".

-- 1) Data em que cada user story foi marcada como feita (alimenta o estimado x real).
alter table user_stories add column if not exists done_at timestamptz;

-- 2) Registros manuais do calendário.
create table if not exists project_events (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects(id) on delete cascade,
  category       varchar(40)  not null,
  title          varchar(255) not null,
  notes          text,
  counterparty   varchar(120),
  occurred_on    date not null,
  finished_on    date,
  planned_on     date,
  opportunity_id uuid references opportunities(id) on delete set null,
  created_by     uuid references users(id),
  created_at     timestamptz not null default now()
);

create index if not exists project_events_project_day_idx on project_events (project_id, occurred_on);

-- 3) Segurança: o app acessa pelo usuário dono do banco (ignora RLS); isso só fecha a API pública.
alter table project_events enable row level security;
