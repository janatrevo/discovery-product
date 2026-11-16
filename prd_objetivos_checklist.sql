-- Objetivos do PRD como checklist: guarda quais objetivos já foram concluídos.
-- Rode ANTES de publicar o código novo. Pode rodar mais de uma vez.
alter table product_docs add column if not exists goals_done jsonb not null default '[]'::jsonb;
