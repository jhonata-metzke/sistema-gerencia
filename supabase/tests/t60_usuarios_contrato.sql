alter table auth.users disable trigger bloquear_cadastro;
update auth.users set email = null;
insert into auth.users (id, email) select id, k || '@teste.local' from t_ids where k in ('owner','gestor1','oper2','leitor1','semPapel');

do $$
declare v_id uuid; n bigint;
begin
  perform t_login('owner');
  v_id := criar_contrato(jsonb_build_object('empresa_id', t_id('e3'), 'cliente_id', t_id('cb'), 'descricao', 'via-rpc',
      'periodicidade', 'mensal', 'dia_vencimento', 5, 'inicio_em', '2026-01-01'), 99.90);
  perform t_eq('2 Contrato criado atomicamente com valor inicial', (select valor_base from contrato_versoes where contrato_id = v_id), 99.90::numeric);
  perform t_raises('2 Contrato com valor inválido não deixa contrato órfão',
    format($q$select criar_contrato(jsonb_build_object('empresa_id', %L, 'cliente_id', %L, 'descricao', 'orfao', 'dia_vencimento', 5, 'inicio_em', '2026-01-01'), -1)$q$, t_id('e3'), t_id('cb')));
  perform t_eq('2 Nenhum contrato órfão após falha', (select count(*) from contratos where descricao = 'orfao'), 0::bigint);

  perform atribuir_papel('semPapel@teste.local', t_id('e3'), 'leitor');
  perform t_ok('22 Proprietário atribui papel por e-mail', exists (select 1 from papeis_usuario where user_id = t_id('semPapel') and papel = 'leitor'));
  perform t_raises('22 Não é possível atribuir papel de proprietário por aqui', format($q$select atribuir_papel('semPapel@teste.local', %L, 'owner')$q$, t_id('e3')));
  perform t_raises('22 E-mail inexistente é recusado', format($q$select atribuir_papel('naoexiste@x.com', %L, 'leitor')$q$, t_id('e3')));
  perform t_ok('22 Proprietário lista usuários', (select count(*) from listar_usuarios()) >= 5);
  perform t_raises('22 Proprietário não pode ser removido', $q$select remover_papel((select id from papeis_usuario where papel = 'owner'))$q$);
  perform remover_papel((select id from papeis_usuario where user_id = t_id('semPapel')));
  perform t_logout();

  perform t_login('gestor1');
  perform t_raises('22 Gestor não lista usuários', $q$select * from listar_usuarios()$q$);
  perform t_raises('22 Gestor não atribui papéis', format($q$select atribuir_papel('semPapel@teste.local', %L, 'gestor')$q$, t_id('e1')));
  perform t_logout();
end $$;

do $$
declare v uuid;
begin
  perform t_login('owner');
  v := criar_venda(jsonb_build_object('empresa_id', t_id('e3'), 'comprador_nome', 'Balcão', 'status', 'registrada'),
        '[{"descricao":"a","quantidade":2,"valor_unitario":10.5,"desconto":1},{"descricao":"b","quantidade":1,"valor_unitario":5}]'::jsonb);
  perform t_eq('13 Venda criada com itens via RPC (20,00 + 5,00)', total_venda(v), 25.00::numeric);
  perform t_raises('13 Venda sem itens é recusada',
    format($q$select criar_venda(jsonb_build_object('empresa_id', %L, 'comprador_nome', 'x'), '[]'::jsonb)$q$, t_id('e3')));
  perform t_raises('13 Item inválido desfaz a venda inteira',
    format($q$select criar_venda(jsonb_build_object('empresa_id', %L, 'comprador_nome', 'atomica'), '[{"descricao":"a","quantidade":0,"valor_unitario":1}]'::jsonb)$q$, t_id('e3')));
  perform t_eq('13 Nenhuma venda órfã após falha', (select count(*) from vendas where comprador_nome = 'atomica'), 0::bigint);
  perform t_logout();
end $$;
