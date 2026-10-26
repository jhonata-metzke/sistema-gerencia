-- Criação atômica de contrato (contrato + valor inicial) e gestão de usuários pelo proprietário.

create function public.criar_contrato(p_dados jsonb, p_valor numeric) returns uuid
language plpgsql as $$
declare r public.contratos; v_id uuid;
begin
  r := jsonb_populate_record(null::public.contratos, p_dados);
  insert into public.contratos (empresa_id, cliente_id, sistema_id, categoria_id, descricao, periodicidade, intervalo_meses,
      dia_vencimento, mes_cobranca_anual, emite_nf, inicio_em, fim_em, situacao, observacoes)
  values (r.empresa_id, r.cliente_id, r.sistema_id, r.categoria_id, r.descricao, coalesce(r.periodicidade, 'mensal'), r.intervalo_meses,
      r.dia_vencimento, r.mes_cobranca_anual, coalesce(r.emite_nf, false), r.inicio_em, r.fim_em, coalesce(r.situacao, 'ativo'), r.observacoes)
  returning id into v_id;
  insert into public.contrato_versoes (contrato_id, valor_base, vigencia_inicio, motivo)
  values (v_id, p_valor, r.inicio_em, 'Valor inicial');
  return v_id;
end $$;

create function public.listar_usuarios()
returns table (user_id uuid, email text, papel_id uuid, empresa_id uuid, papel public.papel_app)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.eh_owner() then raise exception 'Apenas o proprietário pode listar usuários.'; end if;
  return query
    select u.id, u.email::text, p.id, p.empresa_id, p.papel
    from auth.users u left join public.papeis_usuario p on p.user_id = u.id
    order by u.email, p.papel;
end $$;

create function public.atribuir_papel(p_email text, p_empresa uuid, p_papel public.papel_app) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  if not public.eh_owner() then raise exception 'Apenas o proprietário pode atribuir papéis.'; end if;
  if p_papel = 'owner' then raise exception 'O papel de proprietário não pode ser atribuído por aqui.'; end if;
  if p_empresa is null then raise exception 'Informe a empresa.'; end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then raise exception 'Usuário não encontrado. Peça para a pessoa criar a conta primeiro.'; end if;
  insert into public.papeis_usuario (user_id, empresa_id, papel) values (v_user, p_empresa, p_papel)
  on conflict (user_id, empresa_id) do update set papel = excluded.papel;
end $$;

create function public.remover_papel(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_owner() then raise exception 'Apenas o proprietário pode remover papéis.'; end if;
  if exists (select 1 from public.papeis_usuario where id = p_id and papel = 'owner') then
    raise exception 'O proprietário não pode ser removido.';
  end if;
  delete from public.papeis_usuario where id = p_id;
end $$;

-- Funções administrativas: somente usuários autenticados.
revoke execute on function public.listar_usuarios(), public.atribuir_papel(text, uuid, public.papel_app), public.remover_papel(uuid) from public, anon;
grant execute on function public.listar_usuarios(), public.atribuir_papel(text, uuid, public.papel_app), public.remover_papel(uuid) to authenticated;
