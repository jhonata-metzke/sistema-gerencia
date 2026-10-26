#!/usr/bin/env bash
# Recompila o app apontando para o gateway local (o preview serve a pasta dist).
set -euo pipefail
cd "$(dirname "$0")/.."
SECRET="e2e-secret-e2e-secret-e2e-secret-123456"
ANON=$(node -e "const c=require('crypto');const b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');const h=b({alg:'HS256',typ:'JWT'});const p=b({role:'anon',exp:Math.floor(Date.now()/1000)+864000});console.log(h+'.'+p+'.'+c.createHmac('sha256','$SECRET').update(h+'.'+p).digest('base64url'))")
VITE_SUPABASE_URL=http://localhost:3000 VITE_SUPABASE_PUBLISHABLE_KEY=$ANON npx vite build > /tmp/claude-0/build.log 2>&1
tail -1 /tmp/claude-0/build.log
