# Segurança, backup e publicação

## Segurança implementada
- **Autenticação** por e-mail/senha (Supabase Auth). Rotas protegidas no front **e** RLS em todas as tabelas no banco.
- **Autorização no backend (RLS)**: owner (global), gestor e operador (por empresa, escrita), leitor (consulta). Usuário sem papel não vê nada.
- **Segregação por empresa**: políticas por `empresa_id`; clientes só são visíveis a quem enxerga alguma empresa onde ele opera (ou quem o criou).
- **Views com `security_invoker`**: o faturamento respeita a RLS de quem consulta.
- **Auditoria** só legível pelo proprietário e gravável apenas por trigger.
- **Segredos**: nenhuma chave no repositório. O front usa só a chave pública (publishable); `.env` está no `.gitignore`.
- **Primeiro acesso**: o primeiro usuário vira proprietário (`reivindicar_owner`, que recusa se já existir um). **Desative novos cadastros (sign-ups) logo após criar as contas necessárias.**

## Backup e recuperação (recomendação)
1. Ativar os backups automáticos do banco no Lovable Cloud/Supabase (verificar a retenção do plano).
2. Exportação periódica (mensal, e antes de mudanças grandes): `pg_dump` do schema `public` ou export CSV pela tela de Relatórios.
3. Teste de restauração em um projeto separado ao menos uma vez antes de operar em produção.
4. Migrations versionadas no GitHub permitem recriar a estrutura; os dados vêm do backup.

## Publicação
Sem publicação automática. Fluxo: revisão das migrations → aplicar no backend → conferir sincronização com o GitHub → validar no Lovable → **autorização explícita** → publicar → testes pós-publicação (login, empresa, contrato, geração de cobrança, relatório).

## Hospedagem atual: GitHub Pages + backend Lovable Cloud
- O front-end é estático e é publicado por `.github/workflows/pages.yml` em `https://jhonata-metzke.github.io/sistema-gerencia/`, apontando para o banco já criado no Lovable Cloud (projeto "Gestão Comercial").
- Ativação (uma vez): repositório → Settings → Pages → Source: **GitHub Actions**. Depois rode o workflow (Actions → "Publicar no GitHub Pages" → Run workflow).
- A URL e a chave **publishable** do backend estão no workflow de propósito (são públicas por desenho; a proteção dos dados é a RLS). Nunca coloque chaves secretas (service role) no repositório.
- **Logo após o primeiro deploy, crie sua conta**: o primeiro usuário vira proprietário. Em seguida, desative novos cadastros no backend.
- O e-mail de confirmação do cadastro pode apontar para a URL do projeto Lovable (Site URL do backend), não para o Pages; confirmar por lá e entrar pelo Pages funciona.
