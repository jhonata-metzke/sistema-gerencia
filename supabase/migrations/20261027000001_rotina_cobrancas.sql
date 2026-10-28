-- Geração automática de cobranças e atualização das cobranças em aberto quando o valor do contrato muda.

-- Cobranças "em aberto" de um contrato a partir de uma vigência: pendentes, sem pagamento, não canceladas.
create function public.contar_cobrancas_abertas(p_contrato uuid, p_vigencia date) returns int
language sql stable as $$
  select count(*)::int from public.cobrancas c
  where c.contrato_id = p_contrato and c.tipo = 'contrato' and c.status = 'pendente'
    and c.competencia >= date_trunc('month', p_vigencia)::date
    and not exists (select 1 from public.pagamentos p where p.cobranca_id = c.id)
$$;

-- Reaplica o valor vigente às cobranças em aberto; a vigência informada vale mesmo se posterior ao vencimento.
create function public.atualizar_cobrancas_abertas(p_contrato uuid, p_vigencia date) returns int
language plpgsql as $$
declare n int;
begin
  update public.cobrancas c
     set valor_base = public.valor_contrato_em(c.contrato_id, greatest(c.vencimento, p_vigencia)), updated_at = now()
   where c.contrato_id = p_contrato and c.tipo = 'contrato' and c.status = 'pendente'
     and c.competencia >= date_trunc('month', p_vigencia)::date
     and not exists (select 1 from public.pagamentos p where p.cobranca_id = c.id)
     and public.valor_contrato_em(c.contrato_id, greatest(c.vencimento, p_vigencia)) is not null;
  get diagnostics n = row_count;
  return n;
end $$;

-- Rotina diária: gera a competência atual (e fatura as previstas) e, a partir de 5 dias antes da virada do mês,
-- gera a do mês seguinte (como previstas). Idempotente. Roda sem sessão de usuário, então age como o proprietário.
create function public.rotina_cobrancas() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  hoje date := current_date;
  atual date := date_trunc('month', current_date)::date;
  proximo date := (date_trunc('month', current_date) + interval '1 month')::date;
  v_owner uuid; e record; res jsonb := '[]'::jsonb;
begin
  select user_id into v_owner from public.papeis_usuario where papel = 'owner' limit 1;
  if v_owner is null then return jsonb_build_object('ignorado', 'sem proprietário'); end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  for e in select id, coalesce(nome_fantasia, razao_social) nome from public.empresas where situacao = 'ativa' loop
    res := res || jsonb_build_object('empresa', e.nome, 'atual', public.gerar_cobrancas(e.id, atual));
    if hoje >= proximo - 5 then
      res := res || jsonb_build_object('empresa', e.nome, 'proximo', public.gerar_cobrancas(e.id, proximo));
    end if;
  end loop;
  return res;
end $$;
revoke all on function public.rotina_cobrancas() from public, anon, authenticated;

select cron.schedule('rotina-cobrancas', '0 9 * * *', 'select public.rotina_cobrancas()');
