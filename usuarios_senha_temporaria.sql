-- Senha temporária: marca quem ainda precisa trocar a senha no primeiro acesso.
-- Rode ANTES de publicar o código novo (a coluna precisa existir). Pode rodar mais de uma vez.
alter table users add column if not exists must_change_password boolean not null default false;
