#!/usr/bin/env bash
# Banco de ponta a ponta: migrations + papéis do PostgREST + usuário proprietário.
set -euo pipefail
cd "$(dirname "$0")/.."
export PGPASSWORD=postgres
P="psql -X -q -v ON_ERROR_STOP=1 -U postgres -h localhost"
$P -d postgres -c "select pg_terminate_backend(pid) from pg_stat_activity where datname = 'sg_e2e' and pid <> pg_backend_pid()" >/dev/null
$P -d postgres -c "drop database if exists sg_e2e" -c "create database sg_e2e"
$P -d sg_e2e -f supabase/tests/00_stub_supabase.sql
for f in supabase/migrations/*.sql; do $P -d sg_e2e -f "$f"; done
$P -d sg_e2e <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticator') then create role authenticator login noinherit password 'auth'; end if;
end $$;
grant anon, authenticated to authenticator;
grant usage on schema public to anon;
grant execute on function public.tenho_owner() to anon;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'dono@teste.local');
SQL
