#!/usr/bin/env bash
# Reinicia o banco de ponta a ponta e executa o fluxo pela interface.
set -uo pipefail
cd "$(dirname "$0")/.."
export PGPASSWORD=postgres
./e2e/setup-db.sh >/dev/null 2>&1
psql -X -q -U postgres -h localhost -d sg_e2e -c "notify pgrst, 'reload schema'" >/dev/null 2>&1
sleep 2
timeout 500 node e2e/smoke.cjs
