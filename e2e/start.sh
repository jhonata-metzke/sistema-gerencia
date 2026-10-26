#!/usr/bin/env bash
# Sobe PostgREST (3001), gateway (3000) e o app compilado (4173) para o teste de ponta a ponta.
set -euo pipefail
cd "$(dirname "$0")/.."
SECRET="e2e-secret-e2e-secret-e2e-secret-123456"
PGRST_BIN="${PGRST_BIN:-/tmp/claude-0/pgrst/postgrest}"
ANON=$(node -e "const c=require('crypto');const b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');const h=b({alg:'HS256',typ:'JWT'});const p=b({role:'anon',exp:Math.floor(Date.now()/1000)+864000});console.log(h+'.'+p+'.'+c.createHmac('sha256','$SECRET').update(h+'.'+p).digest('base64url'))")
PGRST_DB_URI="postgres://authenticator:auth@localhost/sg_e2e" PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET="$SECRET" PGRST_SERVER_PORT=3001 nohup "$PGRST_BIN" > /tmp/claude-0/pgrst.log 2>&1 &
nohup node e2e/proxy.cjs > /tmp/claude-0/proxy.log 2>&1 &
VITE_SUPABASE_URL=http://localhost:3000 VITE_SUPABASE_PUBLISHABLE_KEY=$ANON npx vite build > /tmp/claude-0/build.log 2>&1
nohup npx vite preview --port 4173 --strictPort > /tmp/claude-0/preview.log 2>&1 &
sleep 3
echo started
