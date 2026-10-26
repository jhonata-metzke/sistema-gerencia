do $$
declare e1 uuid := t_id('e1'); e2 uuid := t_id('e2'); e3 uuid := t_id('e3');
        r record;
begin
  perform t_login('owner');
  -- faturamento por tipo (E1 2026): mensalidades 4150 (cancelada de 300 excluída), adicionais 860, vendas 100
  perform t_eq('15 Faturamento de mensalidades E1 em 2026 = 4150,00',
    (select coalesce(sum(valor),0) from v_receitas where empresa_id = e1 and tipo = 'mensalidade' and extract(year from competencia) = 2026), 4150.00::numeric);
  perform t_eq('15 Faturamento de adicionais E1 em 2026 = 860,00',
    (select coalesce(sum(valor),0) from v_receitas where empresa_id = e1 and tipo = 'adicional' and extract(year from competencia) = 2026), 860.00::numeric);
  perform t_eq('15 Faturamento de vendas E1 em 2026 = 100,00 (líquido de devolução/estorno)',
    (select coalesce(sum(valor),0) from v_receitas where empresa_id = e1 and tipo = 'venda' and extract(year from competencia) = 2026), 100.00::numeric);
  perform t_eq('15 Faturamento de março de E1 = 1600,00 (1350 mensalidades + 130 adicionais + 120 vendas)',
    (select sum(valor) from v_receitas where empresa_id = e1 and competencia = '2026-03-01'), 1600.00::numeric);
  perform t_eq('16 Faturamento anual E1 2026 = 5110,00',
    (select sum(valor) from v_faturamento_mensal where empresa_id = e1 and ano = 2026), 5110.00::numeric);
  perform t_eq('16 Faturamento anual E2 2026 = 965,00 (765 mensalidades + 200 vendas)',
    (select sum(valor) from v_faturamento_mensal where empresa_id = e2 and ano = 2026), 965.00::numeric);
  perform t_eq('16 Empresa sem movimento tem faturamento zero (E3)',
    (select coalesce(sum(valor),0) from v_faturamento_mensal where empresa_id = e3), 0::numeric);

  -- 17: consolidação
  perform t_eq('17 Consolidado = soma das empresas (6075,00)',
    (select sum(valor) from v_faturamento_mensal where ano = 2026), 6075.00::numeric);
  perform t_eq('17 Nenhuma receita aparece duas vezes (chaves únicas)',
    (select count(*) - count(distinct chave) from v_receitas), 0::bigint);
  perform t_eq('3 Painel master: soma por empresa = total consolidado',
    (select sum(s) from (select sum(valor) s from v_receitas group by empresa_id) x),
    (select sum(valor) from v_receitas));
  perform t_eq('3 Recebido e faturado são indicadores distintos: faturado de cobranças E1 = 5010,00',
    (select faturado from indicadores_cobranca(e1, '2026-01-01', '2026-12-01')), 5010.00::numeric);
  perform t_eq('3 Recebido E1 = 200,00', (select recebido from indicadores_cobranca(e1, '2026-01-01', '2026-12-01')), 200.00::numeric);
  perform t_eq('3 Pendente E1 = faturado - recebido = 4810,00', (select pendente from indicadores_cobranca(e1, '2026-01-01', '2026-12-01')), 4810.00::numeric);
  perform t_ok('12 Indicadores apontam cobranças vencidas',
    (select vencido > 0 and qtd_vencidas > 0 from indicadores_cobranca(e1, '2026-01-01', '2026-12-01')));
  perform t_ok('15 Previsto aparece separado do faturado (mar/2027)',
    (select previsto > 0 and faturado = 0 from indicadores_cobranca(e1, '2027-03-01', '2027-03-01')));
  perform t_eq('5 Cliente A tem receitas em duas empresas sem mistura (E1 e E2 separadas)',
    (select count(distinct empresa_id) from v_receitas where cliente_id = t_id('ca')), 2::bigint);
  perform t_eq('5 Receita do cliente A em E2 é só a da E2 (765 + 200)',
    (select sum(valor) from v_receitas where cliente_id = t_id('ca') and empresa_id = e2), 965.00::numeric);

  -- 21: filtros
  perform t_eq('21 Filtro por empresa/ano/mês/tipo na view agregada = filtro nos registros',
    (select coalesce(sum(valor),0) from v_faturamento_mensal where empresa_id = e1 and ano = 2026 and mes = 3 and tipo = 'adicional'),
    (select coalesce(sum(valor),0) from v_receitas where empresa_id = e1 and competencia = '2026-03-01' and tipo = 'adicional'));
  perform t_eq('21 Agregado mensal confere com os registros em todo o período',
    (select sum(valor) from v_faturamento_mensal), (select sum(valor) from v_receitas));
  perform t_eq('21 Contratos: mensalidades contratadas E1 usam o valor vigente (200 do mensal-A)',
    (select mensalidades_contratadas from resumo_contratos(e1)), 200.00::numeric);

  -- 18/19: limite individualizado e alertas
  insert into parametros_limite (empresa_id, ano, limite, regime) values (e1, 2026, 10000.00, 'MEI'), (e3, 2026, 100.00, 'MEI');
  select * into r from limite_situacao(e1, 2026);
  perform t_eq('18 Limite E1 configurado individualmente', r.limite, 10000.00::numeric);
  perform t_eq('18 Acumulado E1 = 5110,00 e saldo = 4890,00', r.acumulado::text || '/' || r.saldo::text, '5110.00/4890.00');
  perform t_eq('18 Percentual utilizado E1 = 51,10', r.percentual, 51.10::numeric);
  perform t_eq('18 Nível ok abaixo do alerta', r.nivel, 'ok');
  perform t_eq('18 Projeção anual é estimativa (5110 / 10 meses x 12)', r.projecao_anual, 6132.00::numeric);
  perform t_eq('18 E2 sem parâmetro não recebe limite presumido', (select nivel from limite_situacao(e2, 2026)), 'sem_parametro');
  perform t_eq('18 E3 tem limite próprio (100,00)', (select limite from limite_situacao(e3, 2026)), 100.00::numeric);
  perform t_eq('18 Cada empresa é avaliada separadamente (3 linhas no master)',
    (select count(*) from limite_situacao(null, 2026)), 3::bigint);
  update parametros_limite set limite = 6500.00 where empresa_id = e1;
  perform t_eq('19 Alerta de atenção (78,62%)', (select nivel from limite_situacao(e1, 2026)), 'atencao');
  update parametros_limite set limite = 5200.00 where empresa_id = e1;
  perform t_eq('19 Alerta crítico (98,27%)', (select nivel from limite_situacao(e1, 2026)), 'critico');
  update parametros_limite set limite = 4700.00 where empresa_id = e1;
  perform t_eq('19 Limite ultrapassado', (select nivel from limite_situacao(e1, 2026)), 'ultrapassado');
  update parametros_limite set alerta_atencao = 30, alerta_critico = 40, limite = 10000 where empresa_id = e1;
  perform t_eq('19 Percentuais de alerta são configuráveis (30/40 => crítico com 51,1%)', (select nivel from limite_situacao(e1, 2026)), 'critico');
  perform t_eq('18 Alterar parâmetros não muda lançamentos (faturamento E1 segue 5110,00)',
    (select sum(valor) from v_faturamento_mensal where empresa_id = e1 and ano = 2026), 5110.00::numeric);
  perform t_logout();
end $$;
