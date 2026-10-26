insert into clientes (razao_social, cnpj) values ('Cliente Teste D', '99887766000105');
insert into t_ids select 'cd', id from clientes where razao_social = 'Cliente Teste D';
insert into contratos (empresa_id, cliente_id, descricao, periodicidade, dia_vencimento, inicio_em)
  values (t_id('e2'), t_id('cd'), 'mensal-D-E2', 'mensal', 10, '2026-01-01');

do $$
declare n bigint;
begin
  perform t_login('semPapel');
  select (select count(*) from empresas) + (select count(*) from clientes) + (select count(*) from contratos)
       + (select count(*) from cobrancas) + (select count(*) from pagamentos) + (select count(*) from vendas)
       + (select count(*) from v_receitas) + (select count(*) from v_cobrancas) + (select count(*) from adicionais) into n;
  perform t_eq('22 Usuário sem papel não enxerga nenhum dado', n, 0::bigint);
  perform t_raises('22 Usuário sem papel não pode se atribuir papel',
    format($q$insert into papeis_usuario(user_id, empresa_id, papel) values (%L, %L, 'gestor')$q$, t_id('semPapel'), t_id('e1')));
  perform t_raises('22 Usuário sem papel não pode criar cliente',
    $q$insert into clientes(razao_social, cnpj) values ('Z', '11444777000161')$q$);
  perform t_eq('22 Segundo usuário não consegue virar proprietário', reivindicar_owner(), false);
  perform t_logout();

  perform t_login('gestor1');
  perform t_eq('22 Gestor da E1 enxerga só a E1', (select count(*) from empresas), 1::bigint);
  perform t_eq('2 Consulta individual: contratos visíveis só da E1', (select count(*) from contratos where empresa_id <> t_id('e1')), 0::bigint);
  perform t_eq('2 Consulta individual: receitas só da E1', (select count(*) from v_receitas where empresa_id <> t_id('e1')), 0::bigint);
  perform t_ok('2 Consulta individual: faturamento da E1 visível', (select sum(valor) from v_receitas) = 5110.00);
  perform t_eq('22 Cliente exclusivo da E2 é invisível ao gestor da E1', (select count(*) from clientes where id = t_id('cd')), 0::bigint);
  perform t_eq('22 Cliente com operações em E1 e E2 é visível', (select count(*) from clientes where id = t_id('ca')), 1::bigint);
  perform t_raises('22 Gestor da E1 não cria contrato na E2',
    format($q$insert into contratos(empresa_id, cliente_id, descricao, dia_vencimento, inicio_em) values (%L, %L, 'x', 1, '2026-01-01')$q$, t_id('e2'), t_id('ca')));
  perform t_raises('22 Gestor da E1 não gera cobranças da E2', format($q$select gerar_cobrancas(%L, '2026-01-01')$q$, t_id('e2')));
  perform t_eq('22 Gestor não lê a auditoria', (select count(*) from auditoria), 0::bigint);
  perform t_bloqueado('22 Gestor não altera dados da empresa (só o proprietário)',
    format($q$update empresas set razao_social = 'x' where id = %L$q$, t_id('e1')));
  perform t_ok('22 Gestor da E1 lê só os parâmetros de limite da E1', (select count(*) from parametros_limite where empresa_id <> t_id('e1')) = 0);
  perform t_logout();

  perform t_login('oper2');
  perform t_eq('22 Operador da E2 não vê contratos da E1', (select count(*) from contratos where empresa_id = t_id('e1')), 0::bigint);
  perform t_eq('22 Operador da E2 vê o cliente exclusivo da E2', (select count(*) from clientes where id = t_id('cd')), 1::bigint);
  perform t_eq('22 Operador da E2 vê contratos da E2', (select count(*) from contratos where empresa_id = t_id('e2')), 2::bigint);
  perform t_ok('22 Operador da E2 gera cobranças da E2', (gerar_cobrancas(t_id('e2'), '2026-01-01')->>'criadas') is not null);
  perform t_bloqueado('22 Operador não exclui cliente', format($q$delete from clientes where id = %L$q$, t_id('cd')));
  perform t_raises('22 Operador não grava parâmetros de limite',
    format($q$insert into parametros_limite(empresa_id, ano, limite) values (%L, 2030, 1000)$q$, t_id('e2')));
  perform t_logout();

  perform t_login('leitor1');
  perform t_ok('22 Leitor da E1 consulta a E1', (select count(*) from contratos) > 0);
  perform t_raises('22 Leitor não cria cliente', $q$insert into clientes(razao_social, cnpj) values ('Z', '11444777000161')$q$);
  perform t_raises('22 Leitor não gera cobranças', format($q$select gerar_cobrancas(%L, '2026-01-01')$q$, t_id('e1')));
  perform t_raises('22 Leitor não registra pagamento',
    format($q$insert into pagamentos(cobranca_id, valor) select id, 1 from cobrancas where empresa_id = %L limit 1$q$, t_id('e1')));
  perform t_logout();

  perform t_login('owner');
  perform t_ok('22 Proprietário lê o histórico de alterações', (select count(*) from auditoria) > 0);
  perform t_raises('22 Ninguém grava na auditoria diretamente',
    $q$insert into auditoria(tabela, acao) values ('x', 'y')$q$);
  perform t_ok('22 Proprietário enxerga as três empresas no master', (select count(*) from empresas) = 3);
  perform t_logout();
end $$;
