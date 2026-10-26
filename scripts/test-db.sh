#!/usr/bin/env bash
# Cria um banco temporário, aplica as migrations e executa os testes SQL.
set -euo pipefail
cd "$(dirname "$0")/.."
DB=sg_test
PSQL="psql -X -q -v ON_ERROR_STOP=1 -U postgres -h ${PGHOST:-localhost} -d"
export PGPASSWORD="${PGPASSWORD:-postgres}"
psql -X -q -U postgres -h "${PGHOST:-localhost}" -d postgres -c "drop database if exists $DB" -c "create database $DB"
$PSQL $DB -f supabase/tests/00_stub_supabase.sql
for f in supabase/migrations/*.sql; do $PSQL $DB -f "$f"; done
$PSQL $DB -f supabase/tests/01_helpers.sql
$PSQL $DB -f supabase/tests/02_seed.sql
for f in supabase/tests/t*.sql; do $PSQL $DB -f "$f"; done
psql -X -U postgres -h "${PGHOST:-localhost}" -d $DB -At -F ' | ' -c "select case when ok then 'PASSOU' else 'FALHOU' end, nome, coalesce(detalhe,'') from t_res order by n"
psql -X -U postgres -h "${PGHOST:-localhost}" -d $DB -At -c "select 'RESUMO: ' || count(*) filter (where ok) || ' passaram, ' || count(*) filter (where not ok) || ' falharam' from t_res"
FALHAS=$(psql -X -U postgres -h "${PGHOST:-localhost}" -d $DB -At -c "select count(*) from t_res where not ok")
[ "$FALHAS" = "0" ]
