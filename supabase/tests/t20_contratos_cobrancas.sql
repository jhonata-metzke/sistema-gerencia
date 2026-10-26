-- Contratos (dados fictícios de teste)
insert into contratos (empresa_id, cliente_id, descricao, periodicidade, intervalo_meses, dia_vencimento, inicio_em) values
  (t_id('e1'), t_id('ca'), 'mensal-A', 'mensal', null, 31, '2026-01-15'),
  (t_id('e1'), t_id('ca'), 'anual-A', 'anual', null, 10, '2026-03-10'),
  (t_id('e2'), t_id('ca'), 'mensal-A-E2', 'mensal', null, 5, '2026-01-01'),
  (t_id('e1'), t_id('cb'), 'tri-B', 'intervalo', 3, 20, '2026-01-01'),
  (t_id('e1'), t_id('cc'), 'unica-C', 'unica', null, 15, '2026-02-01');
insert into t_ids select 'c_mensal', id from contratos where descricao = 'mensal-A';
insert into t_ids select 'c_anual', id from contratos where descricao = 'anual-A';
insert into t_ids select 'c_e2', id from contratos where descricao = 'mensal-A-E2';
insert into t_ids select 'c_tri', id from contratos where descricao = 'tri-B';
insert into t_ids select 'c_unica', id from contratos where descricao = 'unica-C';
insert into contrato_versoes (contrato_id, valor_base, vigencia_inicio) values
  (t_id('c_mensal'), 150.00, '2026-01-15'), (t_id('c_anual'), 1200.00, '2026-03-10'),
  (t_id('c_e2'), 85.00, '2026-01-01'), (t_id('c_tri'), 300.00, '2026-01-01'),
  (t_id('c_unica'), 500.00, '2026-02-01');

-- Adicionais
insert into adicionais (empresa_id, cliente_id, contrato_id, descricao, valor, data, competencia, periodicidade) values
  (t_id('e1'), t_id('ca'), t_id('c_anual'),  'avulso-no-anual', 80.00,  '2026-03-05', '2026-03-01', 'unica'),
  (t_id('e1'), t_id('ca'), t_id('c_mensal'), 'recorrente-mensal', 50.00, '2026-02-05', '2026-02-01', 'mensal'),
  (t_id('e1'), t_id('cc'), null,             'anual-avulso-cliente', 120.00, '2026-05-10', '2026-05-01', 'anual'),
  (t_id('e1'), t_id('ca'), t_id('c_anual'),  'mensal-em-contrato-anual', 30.00, '2026-04-02', '2026-04-01', 'mensal');

do $$
declare m int; r jsonb; r2 jsonb;
begin
  perform t_login('owner');
  for m in 1..9 loop
    perform gerar_cobrancas(t_id('e1'), make_date(2026, m, 1));
    perform gerar_cobrancas(t_id('e2'), make_date(2026, m, 1));
  end loop;

  perform t_eq('6 Mensalidade mensal: 9 cobranças de jan a set',
    (select count(*) from cobrancas where contrato_id = t_id('c_mensal') and tipo = 'contrato'), 9::bigint);
  perform t_eq('6 Dia 31 em fevereiro vence em 28/02/2026',
    (select vencimento from cobrancas where contrato_id = t_id('c_mensal') and competencia = '2026-02-01' and tipo = 'contrato'),
    date '2026-02-28');
  perform t_eq('6 Dia 31 em abril vence em 30/04/2026',
    (select vencimento from cobrancas where contrato_id = t_id('c_mensal') and competencia = '2026-04-01' and tipo = 'contrato'),
    date '2026-04-30');
  perform t_eq('7 Contrato anual gera uma única cobrança no ano',
    (select count(*) from cobrancas where contrato_id = t_id('c_anual') and tipo = 'contrato'), 1::bigint);
  perform t_eq('7 Contrato anual cobra em março (mês de início)',
    (select competencia from cobrancas where contrato_id = t_id('c_anual') and tipo = 'contrato'), date '2026-03-01');
  perform t_eq('7 Contrato por intervalo (3 meses) gera jan, abr, jul',
    (select count(*) from cobrancas where contrato_id = t_id('c_tri')), 3::bigint);
  perform t_eq('7 Contrato único gera uma cobrança',
    (select count(*) from cobrancas where contrato_id = t_id('c_unica')), 1::bigint);

  perform t_eq('8 Adicional avulso entra na cobrança do contrato (1200 + 80)',
    (select valor_total from cobrancas where contrato_id = t_id('c_anual') and tipo = 'contrato'), 1280.00::numeric);
  perform t_eq('8 Adicional recorrente entra em 8 cobranças mensais (fev a set)',
    (select count(*) from cobranca_adicionais ca join adicionais a on a.id = ca.adicional_id where a.descricao = 'recorrente-mensal'), 8::bigint);
  perform t_eq('8 Adicional anual sem contrato gera cobrança própria em maio',
    (select count(*) from cobrancas where tipo = 'adicional' and cliente_id = t_id('cc') and competencia = '2026-05-01'), 1::bigint);
  perform t_eq('8 Adicional mensal de contrato anual gera cobranças próprias (abr a set), sem cobrança de contrato',
    (select count(*) from cobrancas where tipo = 'adicional' and contrato_id = t_id('c_anual')), 6::bigint);
  perform t_eq('8 Cobrança distingue base, adicionais e total (fev: 150 / 50 / 200)',
    (select valor_base::text || '/' || valor_adicionais::text || '/' || valor_total::text from cobrancas
      where contrato_id = t_id('c_mensal') and competencia = '2026-02-01' and tipo = 'contrato'), '150.00/50.00/200.00');

  -- 10: reprocessar não duplica
  select count(*) into m from cobrancas;
  r := gerar_cobrancas(t_id('e1'), '2026-03-01');
  r2 := gerar_cobrancas(t_id('e1'), '2026-03-20');
  perform t_eq('10 Reprocessar a competência não cria cobranças', (r->>'criadas')::int, 0);
  perform t_eq('10 Reprocessar não vincula adicionais de novo', (r2->>'adicionais_vinculados')::int, 0);
  perform t_eq('10 Total de cobranças inalterado após reprocesso', (select count(*) from cobrancas), m::bigint);
  perform t_eq('10 Adicional não é somado duas vezes após reprocesso',
    (select valor_total from cobrancas where contrato_id = t_id('c_anual') and tipo = 'contrato'), 1280.00::numeric);
  perform t_raises('10 Índice único barra cobrança duplicada de contrato/competência',
    format($q$insert into cobrancas(empresa_id, cliente_id, contrato_id, tipo, competencia, vencimento, valor_base)
      values (%L, %L, %L, 'contrato', '2026-03-01', '2026-03-31', 1)$q$, t_id('e1'), t_id('ca'), t_id('c_mensal')));
  perform t_logout();
end $$;

-- Pagamentos
do $$
declare v_cob uuid; v_antes numeric; v_depois numeric;
begin
  perform t_login('owner');
  select id into v_cob from cobrancas where contrato_id = t_id('c_mensal') and competencia = '2026-03-01' and tipo = 'contrato';
  select sum(valor) into v_antes from v_receitas where empresa_id = t_id('e1');
  insert into pagamentos (cobranca_id, valor, data_recebimento) values (v_cob, 60.00, '2026-03-12');
  perform t_eq('11 Pagamento parcial: status parcial', (select status::text from cobrancas where id = v_cob), 'parcial');
  perform t_eq('11 Saldo pendente = 200 - 60 = 140', (select valor_pendente from v_cobrancas where id = v_cob), 140.00::numeric);
  perform t_eq('11 Status exibido: parcialmente paga', (select status_exibicao from v_cobrancas where id = v_cob), 'parcialmente_paga');
  perform t_raises('11 Pagamento acima do saldo é rejeitado',
    format($q$insert into pagamentos(cobranca_id, valor) values (%L, 140.01)$q$, v_cob));
  insert into pagamentos (cobranca_id, valor, data_recebimento) values (v_cob, 140.00, '2026-03-20');
  perform t_eq('11 Quitação muda o status para paga', (select status::text from cobrancas where id = v_cob), 'paga');
  select sum(valor) into v_depois from v_receitas where empresa_id = t_id('e1');
  perform t_eq('11 Pagamento não altera o faturamento (não vira nova receita)', v_depois, v_antes);
  perform t_eq('11 Recebido é registrado à parte (200)',
    (select valor_pago from v_cobrancas where id = v_cob), 200.00::numeric);

  perform t_ok('12 Cobrança pendente vencida é identificada',
    (select vencida and status_exibicao = 'vencida' from v_cobrancas
      where contrato_id = t_id('c_mensal') and competencia = '2026-02-01' and tipo = 'contrato'));
  perform t_ok('12 Cobrança paga não é vencida',
    not (select vencida from v_cobrancas where id = v_cob));
  perform t_logout();
end $$;
