-- Dados FICTÍCIOS apenas para teste (CNPJs de exemplo com dígitos verificadores válidos).
insert into t_ids values
  ('owner', gen_random_uuid()), ('gestor1', gen_random_uuid()), ('oper2', gen_random_uuid()),
  ('leitor1', gen_random_uuid()), ('semPapel', gen_random_uuid());

insert into empresas (razao_social, nome_fantasia, cnpj, regime_tributario) values
  ('Empresa Teste Um', 'E1', '11.222.333/0001-81', 'MEI'),
  ('Empresa Teste Dois', 'E2', '11444777000161', 'Simples Nacional'),
  ('Empresa Teste Tres', 'E3', '12ABC345000188', 'MEI');
insert into t_ids select 'e1', id from empresas where nome_fantasia = 'E1';
insert into t_ids select 'e2', id from empresas where nome_fantasia = 'E2';
insert into t_ids select 'e3', id from empresas where nome_fantasia = 'E3';

insert into papeis_usuario (user_id, empresa_id, papel) values
  (t_id('owner'), null, 'owner'),
  (t_id('gestor1'), t_id('e1'), 'gestor'),
  (t_id('oper2'), t_id('e2'), 'operador'),
  (t_id('leitor1'), t_id('e1'), 'leitor');

insert into clientes (razao_social, cnpj) values
  ('Cliente Teste A', '12345678000195'),
  ('Cliente Teste B', 'ABCDEFGH000195'),
  ('Cliente Teste C', '00.000.000/0001-91');
insert into t_ids select 'ca', id from clientes where razao_social = 'Cliente Teste A';
insert into t_ids select 'cb', id from clientes where razao_social = 'Cliente Teste B';
insert into t_ids select 'cc', id from clientes where razao_social = 'Cliente Teste C';
