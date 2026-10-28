-- Reajuste em lote, atualização de cobranças em aberto, faturamento anterior no limite, convites e rotina diária.
alter table auth.users enable trigger bloquear_cadastro;

do $$
declare k1 uuid; k2 uuid; n int; v_cob uuid; v_pago uuid; v_res jsonb;
begin
  perform t_login('owner');
  k1 := criar_contrato(jsonb_build_object('empresa_id', t_id('e1'), 'cliente_id', t_id('ca'), 'descricao', 'reaj-1', 'periodicidade', 'mensal', 'dia_vencimento', 10, 'inicio_em', '2026-01-01'), 100);
  k2 := criar_contrato(jsonb_build_object('empresa_id', t_id('e1'), 'cliente_id', t_id('cb'), 'descricao', 'reaj-2', 'periodicidade', 'mensal', 'dia_vencimento', 10, 'inicio_em', '2026-01-01'), 200);
  perform gerar_cobrancas(t_id('e1'), '2026-03-01');
  v_pago := (select id from cobrancas where contrato_id = k2 and competencia = '2026-03-01');
  insert into pagamentos (cobranca_id, valor, data_recebimento) values (v_pago, 50, '2026-03-12');

  n := reajustar_contratos(array[k1, k2], 10, '2026-03-01', null);
  perform t_eq('70 Reajuste em lote altera todos os contratos', n, 2);
  perform t_eq('70 Novo valor com percentual (100 -> 110)', valor_contrato_em(k1, '2026-03-15'), 110.00::numeric);
  perform t_eq('70 Valor anterior preservado antes da vigência', valor_contrato_em(k1, '2026-02-15'), 100.00::numeric);
  perform t_eq('70 Cobrança em aberto não muda sem confirmação', (select valor_base from cobrancas where contrato_id = k1 and competencia = '2026-03-01'), 100.00::numeric);
  perform t_eq('70 Conta cobranças em aberto (a parcial/paga não conta)', contar_cobrancas_abertas_lote(array[k1, k2], '2026-03-01'), 1);
  perform t_eq('70 Atualiza só as em aberto', atualizar_cobrancas_abertas_lote(array[k1, k2], '2026-03-01'), 1);
  perform t_eq('70 Cobrança em aberto recebe o novo valor', (select valor_base from cobrancas where contrato_id = k1 and competencia = '2026-03-01'), 110.00::numeric);
  perform t_eq('70 Cobrança com pagamento permanece intacta', (select valor_base from cobrancas where id = v_pago), 200.00::numeric);
  perform t_raises('70 Percentual inválido é recusado', format($q$select reajustar_contratos(array[%L::uuid], -100, '2026-04-01')$q$, k1));

  -- vigência posterior ao vencimento: o novo valor vale quando o usuário escolhe atualizar
  perform alterar_valor_contrato(k1, 150, '2026-03-20');
  perform atualizar_cobrancas_abertas(k1, '2026-03-20');
  perform t_eq('70 Atualização aplica a vigência mesmo após o vencimento', (select valor_base from cobrancas where contrato_id = k1 and competencia = '2026-03-01'), 150.00::numeric);
  perform t_logout();

  -- faturamento anterior ao sistema
  perform t_login('owner');
  insert into parametros_limite (empresa_id, ano, limite) values (t_id('e3'), 2031, 81000);
  perform t_eq('70 Sem faturamento anterior o acumulado é zero', (select acumulado from limite_situacao(t_id('e3'), 2031)), 0.00::numeric);
  update parametros_limite set faturamento_anterior = 12345.67 where empresa_id = t_id('e3') and ano = 2031;
  perform t_eq('70 Faturamento anterior entra no acumulado do limite', (select acumulado from limite_situacao(t_id('e3'), 2031)), 12345.67::numeric);
  perform t_logout();
end $$;

-- convites: cadastro só com convite; papel concedido ao criar a conta
do $$
declare v_id uuid := gen_random_uuid(); r text;
begin
  perform t_raises('70 Cadastro sem convite é bloqueado', $q$insert into auth.users (id, email) values (gen_random_uuid(), 'intruso@x.com')$q$);
  perform t_login('gestor1');
  perform t_raises('70 Gestor não convida', format($q$select convidar('c@x.com', %L, 'leitor')$q$, t_id('e1')));
  perform t_logout();
  perform t_login('owner');
  r := convidar('Contador@X.com ', t_id('e1'), 'leitor');
  perform t_eq('70 Convite registrado', r, 'convidado');
  perform t_eq('70 E-mail do convite normalizado', (select count(*) from listar_convites() where email = 'contador@x.com'), 1::bigint);
  perform t_raises('70 Convite de proprietário é recusado', format($q$select convidar('d@x.com', %L, 'owner')$q$, t_id('e1')));
  perform t_logout();
  insert into auth.users (id, email) values (v_id, 'contador@x.com');
  perform t_ok('70 Papel concedido ao criar a conta convidada', exists (select 1 from papeis_usuario where user_id = v_id and empresa_id = t_id('e1') and papel = 'leitor'));
  perform t_eq('70 Convite consumido', (select count(*) from convites where email = 'contador@x.com'), 0::bigint);
  perform t_login('owner');
  perform t_eq('70 Conta existente recebe o papel direto', convidar('contador@x.com', t_id('e2'), 'operador'), 'concedido');
  perform t_logout();
end $$;

-- rotina diária (roda sem sessão de usuário)
do $$
declare res jsonb; n_antes bigint; n_depois bigint; mes date := date_trunc('month', current_date)::date;
begin
  select count(*) into n_antes from cobrancas where competencia = mes;
  res := rotina_cobrancas();
  select count(*) into n_depois from cobrancas where competencia = mes;
  perform t_ok('70 Rotina gera as cobranças do mês atual', n_depois > n_antes or (select count(*) from contratos where situacao = 'ativo') = 0);
  perform t_ok('70 Rotina é idempotente', (rotina_cobrancas() is not null) and (select count(*) from cobrancas where competencia = mes) = n_depois);
  if current_date >= (date_trunc('month', current_date) + interval '1 month')::date - 5 then
    perform t_ok('70 Rotina gera o mês seguinte dentro dos 5 dias finais', exists (select 1 from cobrancas where competencia = (date_trunc('month', current_date) + interval '1 month')::date and faturada_em is null));
  else
    perform t_ok('70 Rotina não gera o mês seguinte antes dos 5 dias finais', not exists (select 1 from cobrancas where competencia = (date_trunc('month', current_date) + interval '1 month')::date));
  end if;
end $$;
