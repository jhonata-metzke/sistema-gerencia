# Gestão Comercial e Faturamento (multi-CNPJ)

Controle de clientes, mensalidades, cobranças, adicionais e vendas de várias empresas, com faturamento calculado automaticamente, painel master consolidado e acompanhamento de limite por CNPJ. **Não** inclui despesas, lucro, emissão fiscal nem integração bancária.

- Front-end: React + TypeScript + Tailwind (Vite). Backend: Postgres/Supabase (RLS, funções SQL, views).
- Critérios de cálculo: [docs/criterios-faturamento.md](docs/criterios-faturamento.md) · Modelo: [docs/modelo-de-dados.md](docs/modelo-de-dados.md) · Segurança/backup/publicação: [docs/seguranca-backup-publicacao.md](docs/seguranca-backup-publicacao.md) · Testes: [docs/relatorio-de-testes.md](docs/relatorio-de-testes.md)

## Rodando
```
cp .env.example .env   # VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY
npm install && npm run dev
```
Banco: aplique `supabase/migrations/*.sql` em ordem. Testes: `npm test`, `npm run typecheck`, `PGPASSWORD=... npm run test:db`, `./e2e/run.sh`.

O primeiro usuário autenticado vira proprietário. Desative novos cadastros depois de criar as contas necessárias.
