-- Calendário do projeto: arquivos anexados aos registros (ex.: o PPT de uma apresentação).
-- Rode UMA vez no Supabase: SQL Editor > New query > cole este arquivo inteiro > Run.
-- Precisa ter rodado antes o calendario_do_projeto.sql. É seguro rodar de novo.
-- O arquivo em si fica no Storage (bucket privado "project-event-files", criado pelo app no primeiro envio).

create table if not exists project_event_files (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  event_id     uuid not null references project_events(id) on delete cascade,
  file_path    text not null,
  file_name    varchar(255) not null,
  content_type varchar(150),
  size_bytes   integer,
  created_by   uuid references users(id),
  created_at   timestamptz not null default now()
);

create index if not exists project_event_files_event_idx on project_event_files (event_id);

alter table project_event_files enable row level security;
