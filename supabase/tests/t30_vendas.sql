do $$
declare v1 uuid; v2 uuid; v3 uuid; v4 uuid; vp uuid;
begin
  perform t_login('owner');
  insert into vendas (empresa_id, cliente_id, data_operacao, documento, status)
    values (t_id('e1'), t_id('ca'), '2026-03-10', 'V1', 'faturada') returning id into v1;
  insert into venda_itens (venda_id, descricao, quantidade, valor_unitario, desconto) values
    (v1, 'item 1', 2, 10.50, 1.00), (v1, 'item 2', 3, 33.33, 0), (v1, 'item 3', 0.333, 10.00, 0);
  perform t_eq('13 Venda com múltiplos itens: total calculado = 20,00 + 99,99 + 3,33', total_venda(v1), 123.32::numeric);

  insert into vendas (empresa_id, comprador_nome, data_operacao, status) values (t_id('e1'), 'Consumidor sem cadastro', '2026-03-12', 'registrada') returning id into v2;
  insert into venda_itens (venda_id, descricao, quantidade, valor_unitario) values (v2, 'item', 1, 50.00);
  perform t_ok('13 Venda sem cliente cadastrado é permitida (comprador avulso)', true);
  perform t_raises('13 Venda sem cliente e sem comprador é rejeitada',
    format($q$insert into vendas(empresa_id, data_operacao) values (%L, '2026-03-01')$q$, t_id('e1')));
  perform t_raises('13 Desconto maior que o valor do item é rejeitado',
    format($q$insert into venda_itens(venda_id, descricao, quantidade, valor_unitario, desconto) values (%L, 'x', 1, 5.00, 6.00)$q$, v1));
  perform t_eq('13 Venda apenas registrada não conta como faturamento',
    (select count(*) from v_receitas where origem_id = v2), 0::bigint);

  insert into vendas (empresa_id, cliente_id, data_operacao, status) values (t_id('e2'), t_id('ca'), '2026-03-20', 'faturada') returning id into v3;
  insert into venda_itens (venda_id, descricao, quantidade, valor_unitario) values (v3, 'item', 1, 200.00);

  insert into vendas (empresa_id, cliente_id, data_operacao, status) values (t_id('e1'), t_id('ca'), '2026-03-15', 'faturada') returning id into v4;
  insert into venda_itens (venda_id, descricao, quantidade, valor_unitario) values (v4, 'item', 1, 70.00);
  update vendas set status = 'cancelada' where id = v4;
  perform t_eq('14 Venda cancelada não é receita', (select count(*) from v_receitas where origem_id = v4), 0::bigint);
  perform t_eq('14 Venda cancelada aparece em v_cancelamentos (70)',
    (select valor from v_cancelamentos where chave = 'venda:' || v4), 70.00::numeric);
  perform t_ok('14 Cancelamento registra a data', (select cancelada_em is not null from vendas where id = v4));
  perform t_raises('14 Venda cancelada não aceita devolução',
    format($q$insert into venda_ajustes(venda_id, tipo, valor) values (%L, 'devolucao', 1)$q$, v4));

  insert into venda_ajustes (venda_id, tipo, valor, data) values (v1, 'estorno', 3.32, '2026-03-30');
  insert into venda_ajustes (venda_id, tipo, valor, data) values (v1, 'devolucao', 20.00, '2026-04-02');
  perform t_eq('14 Estorno reduz as vendas de março (123,32 - 3,32 = 120,00)',
    (select sum(valor) from v_receitas where empresa_id = t_id('e1') and tipo = 'venda' and competencia = '2026-03-01'), 120.00::numeric);
  perform t_eq('14 Devolução reduz as vendas de abril (-20,00)',
    (select sum(valor) from v_receitas where empresa_id = t_id('e1') and tipo = 'venda' and competencia = '2026-04-01'), -20.00::numeric);
  perform t_raises('14 Devoluções acima do total da venda são rejeitadas',
    format($q$insert into venda_ajustes(venda_id, tipo, valor) values (%L, 'devolucao', 100.01)$q$, v1));
  perform t_raises('14 Venda com devolução/estorno não pode ser cancelada',
    format($q$update vendas set status = 'cancelada' where id = %L$q$, v1));
  perform t_ok('14 Devoluções e estornos listados separadamente',
    (select count(*) from v_cancelamentos where tipo in ('estorno','devolucao')) = 2);

  -- 20: precisão monetária
  insert into vendas (empresa_id, comprador_nome, data_operacao, status) values (t_id('e3'), 'Precisao', '2026-01-10', 'registrada') returning id into vp;
  insert into venda_itens (venda_id, descricao, quantidade, valor_unitario) values (vp, 'a', 1, 0.10), (vp, 'b', 1, 0.20), (vp, 'c', 3, 0.10);
  perform t_eq('20 0,10 + 0,20 + 3 x 0,10 = 0,60 exato', total_venda(vp), 0.60::numeric);
  perform t_eq('20 Soma de 3 x 33,33 = 99,99 sem erro de ponto flutuante', (select total from venda_itens where venda_id = v1 and descricao = 'item 2'), 99.99::numeric);
  perform t_eq('20 Quantidade fracionada arredonda a 2 casas (0,333 x 10,00 = 3,33)',
    (select total from venda_itens where venda_id = v1 and descricao = 'item 3'), 3.33::numeric);
  delete from vendas where id = vp;
  perform t_logout();
end $$;
