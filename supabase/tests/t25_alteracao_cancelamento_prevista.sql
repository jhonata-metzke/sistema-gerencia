do $$
declare v_jul uuid; v_cob_jul numeric;
begin
  perform t_login('owner');
  select valor_base into v_cob_jul from cobrancas where contrato_id = t_id('c_mensal') and competencia = '2026-07-01' and tipo = 'contrato';
  perform alterar_valor_contrato(t_id('c_mensal'), 200.00, '2026-07-01', 'reajuste de teste');
  perform t_eq('9 Reajuste não recalcula cobrança já gerada (jul continua 150)',
    (select valor_base from cobrancas where contrato_id = t_id('c_mensal') and competencia = '2026-07-01' and tipo = 'contrato'), 150.00::numeric);
  perform gerar_cobrancas(t_id('e1'), '2026-07-01');
  perform t_eq('9 Reprocessar julho após reajuste mantém o valor histórico',
    (select valor_base from cobrancas where contrato_id = t_id('c_mensal') and competencia = '2026-07-01' and tipo = 'contrato'), 150.00::numeric);
  perform gerar_cobrancas(t_id('e1'), '2026-10-01');
  perform t_eq('9 Nova competência usa o valor vigente (out = 200)',
    (select valor_base from cobrancas where contrato_id = t_id('c_mensal') and competencia = '2026-10-01' and tipo = 'contrato'), 200.00::numeric);
  perform t_eq('9 Histórico de versões preservado (2 versões)',
    (select count(*) from contrato_versoes where contrato_id = t_id('c_mensal')), 2::bigint);
  perform t_eq('9 Valor em 30/06 é 150 e em 01/07 é 200',
    valor_contrato_em(t_id('c_mensal'), '2026-06-30')::text || '/' || valor_contrato_em(t_id('c_mensal'), '2026-07-01')::text, '150.00/200.00');
  update contratos set observacoes = 'alterado' where id = t_id('c_mensal');
  perform t_ok('9 Alteração do contrato fica registrada no histórico (auditoria com antes/depois)',
    exists (select 1 from auditoria where tabela = 'contratos' and acao = 'UPDATE'
            and registro_id = t_id('c_mensal')::text and antes is not null and depois is not null));

  -- cancelamento de cobrança (tri de julho)
  select id into v_jul from cobrancas where contrato_id = t_id('c_tri') and competencia = '2026-07-01';
  perform cancelar_cobranca(v_jul, 'cancelada em teste');
  perform t_eq('15 Cobrança cancelada aparece em v_cancelamentos (300)',
    (select valor from v_cancelamentos where chave = 'cobranca:' || v_jul), 300.00::numeric);
  perform t_eq('15 Cobrança cancelada não entra no faturamento',
    (select count(*) from v_receitas where origem_id = v_jul), 0::bigint);
  perform t_raises('11 Cobrança cancelada não aceita pagamento',
    format($q$insert into pagamentos(cobranca_id, valor) values (%L, 1)$q$, v_jul));

  -- prevista (competência futura)
  perform gerar_cobrancas(t_id('e1'), '2027-03-01');
  perform t_ok('15 Cobranças de competência futura ficam "prevista"',
    exists (select 1 from v_cobrancas where competencia = '2027-03-01' and status_exibicao = 'prevista'));
  perform t_eq('15 Valores previstos não entram no faturamento realizado',
    (select count(*) from v_receitas where competencia >= '2027-01-01'), 0::bigint);
  perform t_logout();
end $$;
