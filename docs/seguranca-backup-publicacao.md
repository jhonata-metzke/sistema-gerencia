# Segurança, backup e publicação

## Segurança implementada
- **Autenticação** por e-mail/senha (Supabase Auth). Rotas protegidas no front **e** RLS em todas as tabelas no banco.
- **Autorização no backend (RLS)**: owner (global), gestor e operador (por empresa, escrita), leitor (consulta). Usuário sem papel não vê nada.
- **Segregação por empresa**: políticas por `empresa_id`; clientes só são visíveis a quem enxerga alguma empresa onde ele opera (ou quem o criou).
- **Views com `security_invoker`**: o faturamento respeita a RLS de quem consulta.
- **Auditoria** só legível pelo proprietário e gravável apenas por trigger.
- **Segredos**: nenhuma chave no repositório. O front usa só a chave pública (publishable); `.env` está no `.gitignore`.
- **Primeiro acesso**: o primeiro usuário vira proprietário (`reivindicar_owner`, que recusa se já existir um). Contas novas só nascem por convite do proprietário (gatilho no banco).

## Backup e recuperação (recomendação)
1. Ativar os backups automáticos do banco no Lovable Cloud/Supabase (verificar a retenção do plano) e usar também o backup em Excel de Configurações → Backup.
2. Exportação periódica (mensal, e antes de mudanças grandes): `pg_dump` do schema `public` ou export CSV pela tela de Relatórios.
3. Teste de restauração em um projeto separado ao menos uma vez antes de operar em produção.
4. Migrations versionadas no GitHub permitem recriar a estrutura; os dados vêm do backup.

## Publicação
Sem publicação automática. Fluxo: revisão das migrations → aplicar no backend → conferir sincronização com o GitHub → validar no Lovable → **autorização explícita** → publicar → testes pós-publicação (login, empresa, contrato, geração de cobrança, relatório).

## Hospedagem: somente Lovable
- A publicação oficial é feita **só pelo Lovable** (front-end e backend/Lovable Cloud). O workflow do GitHub Pages foi removido; desative o Pages em Settings → Pages se ainda estiver ativo.
- O código que o Lovable usa vive no repositório `fluxo-vendas-faturamento` (sincronizado com o projeto). Este repositório (`sistema-gerencia`) guarda as migrations, os testes e a documentação.
- Mudanças de banco: aplicar a migration no backend e versionar o arquivo em `supabase/migrations/`.

## Automação e acessos
- **Cobranças automáticas**: o agendador do banco (`pg_cron`, job `rotina-cobrancas`, todo dia 06:00 de Brasília) chama `rotina_cobrancas()`: gera o mês atual (e fatura as previstas) e, a partir de 5 dias antes da virada, gera o mês seguinte como previstas.
- **Cadastro por convite**: um gatilho no banco bloqueia contas novas cujo e-mail não tenha sido convidado em Configurações → Usuários e permissões; ao criar a conta, o papel convidado é concedido automaticamente.
- **Backup manual**: Configurações → Backup gera um Excel com todas as tabelas (recomendado mensalmente).
