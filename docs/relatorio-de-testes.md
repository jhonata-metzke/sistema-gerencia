# Relatório de testes

Executados em 26/10/2026 neste ambiente (Postgres 16 local). Nada foi executado em produção.

| Suíte | Comando | Resultado |
|---|---|---|
| Banco (regras, RLS, cálculos) | `npm run test:db` | **137 passaram, 0 falharam** |
| Unitários (CNPJ, dinheiro, datas) | `npm test` | **8 passaram, 0 falharam** |
| Tipos | `npm run typecheck` | sem erros |
| Interface ponta a ponta (navegador real) | `./e2e/run.sh` | **19 passaram, 0 falharam** |

## Cobertura dos 22 testes obrigatórios (banco, `supabase/tests`)
1 empresas · 2 consulta individual · 3 consolidação · 4 cliente centralizado · 5 cliente em duas empresas · 6 mensal · 7 anual/única/intervalo · 8 adicionais avulsos e recorrentes · 9 alteração contratual com histórico · 10 geração sem duplicidade · 11 pagamento parcial · 12 atrasos · 13 venda com vários itens · 14 cancelamentos e devoluções · 15–16 faturamento mensal/anual · 17 consolidação sem duplicidade · 18 limites por CNPJ · 19 alertas · 20 precisão monetária · 21 filtros/relatórios · 22 controle de acesso (papéis, segregação por empresa, auditoria).

## Problemas encontrados e corrigidos durante os testes
- CSS: classe `.input` sobrescrevia utilitários (filtros ocupavam a linha inteira) → movida para `@layer components`.
- Descrição de devolução/estorno saía sem acento na view de receitas.
- Expectativas erradas nos próprios testes (cobranças de outubro) e RLS em UPDATE/DELETE (afeta 0 linhas, não gera erro) → testes ajustados.

## Limitações destes testes (importante)
- **Autenticação simulada**: o banco de teste usa um *stub* de `auth.uid()` e o teste de interface injeta um JWT assinado localmente. O fluxo real de login/cadastro do Supabase Auth (e-mail de confirmação, senha) **não foi exercitado**.
- **Backend local**: PostgREST + Postgres, não o Lovable Cloud. Funções, políticas e migrations devem ser reaplicadas e revalidadas no backend real antes de usar.
- Não foram feitos testes de carga, de acessibilidade completos nem em navegadores diferentes de Chromium.
- Exportação para Excel (.xlsx) foi implementada, mas apenas o CSV foi validado de ponta a ponta.
