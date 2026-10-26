-- Regras de negócio: periodicidade, geração idempotente de cobranças, pagamentos.

-- A competência (1º dia do mês) é cobrada para esta periodicidade, a partir da âncora?
create function public.periodo_ocorre(
  p_per public.periodicidade, p_intervalo int, p_ancora date, p_comp date, p_mes_anual int default null
) returns boolean language sql immutable as $$
  select case
    when p_comp < date_trunc('month', p_ancora)::date then false
    when p_per = 'mensal' then true
    when p_per = 'unica' then p_comp = date_trunc('month', p_ancora)::date
    when p_per = 'anual' then extract(month from p_comp)::int = coalesce(p_mes_anual, extract(month from p_ancora)::int)
    when p_per = 'intervalo' then
      coalesce(p_intervalo, 0) > 0 and
      (((extract(year from p_comp) - extract(year from p_ancora)) * 12
        + extract(month from p_comp) - extract(month from p_ancora))::int % p_intervalo) = 0
    else false
  end
$$;

-- Dia de vencimento ajustado para meses mais curtos (31 -> 30/28/29).
create function public.vencimento_na_competencia(p_comp date, p_dia int) returns date
language sql immutable as $$
  select (date_trunc('month', p_comp)::date
          + (least(p_dia, extract(day from (date_trunc('month', p_comp) + interval '1 month - 1 day'))::int) - 1))
$$;

create function public.valor_contrato_em(p_contrato uuid, p_data date) returns numeric
language sql stable as $$
  select valor_base from public.contrato_versoes
  where contrato_id = p_contrato and vigencia_inicio <= p_data
  order by vigencia_inicio desc limit 1
$$;

-- Altera o valor do contrato a partir de uma vigência. Cobranças já geradas não são tocadas.
create function public.alterar_valor_contrato(
  p_contrato uuid, p_valor numeric, p_vigencia date, p_motivo text default null
) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.contrato_versoes (contrato_id, valor_base, vigencia_inicio, motivo)
  values (p_contrato, p_valor, p_vigencia, p_motivo) returning id into v_id;
  return v_id;
end $$;

-- Gera cobranças de uma competência. Idempotente: reprocessar não duplica nada.
create function public.gerar_cobrancas(p_empresa uuid, p_competencia date) returns jsonb
language plpgsql as $$
declare
  comp date := date_trunc('month', p_competencia)::date;
  fatura boolean := comp <= date_trunc('month', current_date)::date;
  v_elegiveis int; v_criadas int; v_ad int := 0; r record; v_cob uuid; v_dia int;
begin
  if not public.pode_editar(p_empresa) then
    raise exception 'Sem permissão para gerar cobranças desta empresa.';
  end if;

  with elegiveis as (
    select c.id as contrato_id, c.cliente_id,
           public.vencimento_na_competencia(comp, c.dia_vencimento) as venc
    from public.contratos c
    where c.empresa_id = p_empresa and c.situacao = 'ativo'
      and (c.fim_em is null or c.fim_em >= comp)
      and public.periodo_ocorre(c.periodicidade, c.intervalo_meses, c.inicio_em, comp, c.mes_cobranca_anual)
  ), com_valor as (
    select e.*, public.valor_contrato_em(e.contrato_id, e.venc) as valor from elegiveis e
  ), ins as (
    insert into public.cobrancas (empresa_id, cliente_id, contrato_id, tipo, competencia, vencimento,
                                  valor_base, valor_adicionais, faturada_em)
    select p_empresa, v.cliente_id, v.contrato_id, 'contrato', comp, v.venc, v.valor, 0,
           case when fatura then now() end
    from com_valor v where v.valor is not null
    on conflict (contrato_id, competencia) where tipo = 'contrato' do nothing
    returning 1
  )
  select (select count(*) from elegiveis), (select count(*) from ins) into v_elegiveis, v_criadas;

  -- Adicionais: entram em cobrança ainda aberta e sem pagamento do contrato; senão geram cobrança própria.
  for r in
    select a.*, ct.dia_vencimento as dia_contrato
    from public.adicionais a
    left join public.contratos ct on ct.id = a.contrato_id
    where a.empresa_id = p_empresa and a.situacao = 'ativo'
      and (a.fim_em is null or a.fim_em >= comp)
      and public.periodo_ocorre(a.periodicidade, a.intervalo_meses, a.competencia, comp, null)
      and not exists (select 1 from public.cobranca_adicionais x where x.adicional_id = a.id and x.competencia = comp)
    order by a.created_at, a.id
  loop
    v_cob := null;
    if r.contrato_id is not null then
      select id into v_cob from public.cobrancas
      where contrato_id = r.contrato_id and competencia = comp and tipo = 'contrato' and status = 'pendente';
    end if;
    if v_cob is null then
      v_dia := coalesce(r.dia_contrato, extract(day from r.data)::int);
      insert into public.cobrancas (empresa_id, cliente_id, contrato_id, tipo, competencia, vencimento,
                                    valor_base, valor_adicionais, faturada_em)
      values (p_empresa, r.cliente_id, r.contrato_id, 'adicional', comp,
              public.vencimento_na_competencia(comp, v_dia), 0, 0, case when fatura then now() end)
      returning id into v_cob;
    end if;
    insert into public.cobranca_adicionais (cobranca_id, adicional_id, competencia, valor)
    values (v_cob, r.id, comp, r.valor);
    update public.cobrancas set valor_adicionais = valor_adicionais + r.valor where id = v_cob;
    v_ad := v_ad + 1;
  end loop;

  -- Cobranças previstas cuja competência já chegou passam a faturadas.
  if fatura then
    update public.cobrancas set faturada_em = now()
    where empresa_id = p_empresa and competencia = comp and faturada_em is null and status <> 'cancelada';
  end if;

  return jsonb_build_object('competencia', comp, 'contratos_elegiveis', v_elegiveis,
    'criadas', v_criadas, 'ja_existentes', v_elegiveis - v_criadas, 'adicionais_vinculados', v_ad);
end $$;

create function public.cancelar_cobranca(p_id uuid, p_motivo text default null) returns void
language plpgsql as $$
begin
  if exists (select 1 from public.pagamentos where cobranca_id = p_id) then
    raise exception 'Cobrança com pagamentos registrados não pode ser cancelada; estorne os pagamentos antes.';
  end if;
  update public.cobrancas set status = 'cancelada', cancelada_em = now(), motivo_cancelamento = p_motivo
  where id = p_id and status <> 'cancelada';
end $$;

-- ---------- pagamentos ----------
create function public.recalcular_status_cobranca(p_id uuid) returns void
language plpgsql as $$
declare v_pago numeric(14,2);
begin
  select coalesce(sum(valor), 0) into v_pago from public.pagamentos where cobranca_id = p_id;
  update public.cobrancas c set status = case
      when c.status = 'cancelada' then c.status
      when v_pago >= c.valor_total and c.valor_total > 0 then 'paga'
      when v_pago > 0 then 'parcial'
      else 'pendente' end
  where c.id = p_id;
end $$;

create function public.trg_pagamento_validar() returns trigger language plpgsql as $$
declare c record; v_outros numeric(14,2);
begin
  select * into c from public.cobrancas where id = new.cobranca_id;
  if c.status = 'cancelada' then raise exception 'Cobrança cancelada não aceita pagamentos.'; end if;
  select coalesce(sum(valor), 0) into v_outros from public.pagamentos
   where cobranca_id = new.cobranca_id and (tg_op = 'INSERT' or id <> new.id);
  if v_outros + new.valor > c.valor_total then
    raise exception 'Pagamento excede o saldo da cobrança (saldo: %).', c.valor_total - v_outros;
  end if;
  return new;
end $$;
create trigger pagamentos_validar before insert or update on public.pagamentos
  for each row execute function public.trg_pagamento_validar();

create function public.trg_pagamento_status() returns trigger language plpgsql as $$
begin
  perform public.recalcular_status_cobranca(coalesce(new.cobranca_id, old.cobranca_id));
  return coalesce(new, old);
end $$;
create trigger pagamentos_status after insert or update or delete on public.pagamentos
  for each row execute function public.trg_pagamento_status();

-- ---------- vendas ----------
create function public.total_venda(p_venda uuid) returns numeric
language sql stable as $$
  select coalesce(sum(total), 0) from public.venda_itens where venda_id = p_venda
$$;

create function public.trg_ajuste_validar() returns trigger language plpgsql as $$
declare v record; v_outros numeric(14,2);
begin
  select * into v from public.vendas where id = new.venda_id;
  if v.status = 'cancelada' then raise exception 'Venda cancelada não aceita devoluções ou estornos.'; end if;
  select coalesce(sum(valor), 0) into v_outros from public.venda_ajustes
   where venda_id = new.venda_id and (tg_op = 'INSERT' or id <> new.id);
  if v_outros + new.valor > public.total_venda(new.venda_id) then
    raise exception 'Devoluções/estornos excedem o total da venda.';
  end if;
  return new;
end $$;
create trigger ajustes_validar before insert or update on public.venda_ajustes
  for each row execute function public.trg_ajuste_validar();

create function public.trg_venda_cancelamento() returns trigger language plpgsql as $$
begin
  if new.status = 'cancelada' and old.status <> 'cancelada' then
    if exists (select 1 from public.venda_ajustes where venda_id = new.id) then
      raise exception 'Venda com devoluções/estornos não pode ser cancelada.';
    end if;
    new.cancelada_em := now();
  elsif new.status <> 'cancelada' then
    new.cancelada_em := null;
  end if;
  return new;
end $$;
create trigger vendas_cancelamento before update on public.vendas
  for each row execute function public.trg_venda_cancelamento();
