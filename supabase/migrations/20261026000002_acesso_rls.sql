-- Autorização no backend: RLS em todas as tabelas.

create function public.eh_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.papeis_usuario where user_id = auth.uid() and papel = 'owner')
$$;

create function public.pode_ver(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.eh_owner()
      or exists (select 1 from public.papeis_usuario where user_id = auth.uid() and empresa_id = e)
$$;

create function public.pode_editar(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.eh_owner()
      or exists (select 1 from public.papeis_usuario
                 where user_id = auth.uid() and empresa_id = e and papel in ('gestor','operador'))
$$;

create function public.pode_gerir(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.eh_owner()
      or exists (select 1 from public.papeis_usuario
                 where user_id = auth.uid() and empresa_id = e and papel = 'gestor')
$$;

create function public.tem_papel_editor() returns boolean
language sql stable security definer set search_path = public as $$
  select public.eh_owner()
      or exists (select 1 from public.papeis_usuario
                 where user_id = auth.uid() and papel in ('gestor','operador'))
$$;

create function public.tem_papel_gestor() returns boolean
language sql stable security definer set search_path = public as $$
  select public.eh_owner()
      or exists (select 1 from public.papeis_usuario where user_id = auth.uid() and papel = 'gestor')
$$;

create function public.tem_algum_papel() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.papeis_usuario where user_id = auth.uid())
$$;

-- Cliente é visível a quem o criou ou a quem enxerga alguma empresa onde ele tem operação.
create function public.pode_ver_cliente(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.eh_owner()
      or exists (select 1 from public.clientes x where x.id = c and x.created_by = auth.uid())
      or exists (select 1 from public.contratos t where t.cliente_id = c and public.pode_ver(t.empresa_id))
      or exists (select 1 from public.cobrancas t where t.cliente_id = c and public.pode_ver(t.empresa_id))
      or exists (select 1 from public.adicionais t where t.cliente_id = c and public.pode_ver(t.empresa_id))
      or exists (select 1 from public.vendas t where t.cliente_id = c and public.pode_ver(t.empresa_id))
$$;

-- O primeiro usuário autenticado pode se tornar proprietário; depois disso, nunca mais.
-- Recomenda-se desativar novos cadastros (sign-ups) logo após o primeiro acesso.
create function public.reivindicar_owner() returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  if exists (select 1 from public.papeis_usuario where papel = 'owner') then return false; end if;
  insert into public.papeis_usuario (user_id, empresa_id, papel) values (auth.uid(), null, 'owner');
  return true;
end $$;

create function public.tenho_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.papeis_usuario where papel = 'owner')
$$;

-- ---------- RLS ----------
do $$
declare t text;
begin
  foreach t in array array['empresas','papeis_usuario','clientes','sistemas','categorias_receita','contratos','contrato_versoes',
    'adicionais','cobrancas','cobranca_adicionais','pagamentos','vendas','venda_itens','venda_ajustes','parametros_limite','auditoria'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- empresas
create policy empresas_sel on public.empresas for select to authenticated using (public.pode_ver(id));
create policy empresas_ins on public.empresas for insert to authenticated with check (public.eh_owner());
create policy empresas_upd on public.empresas for update to authenticated using (public.eh_owner()) with check (public.eh_owner());
create policy empresas_del on public.empresas for delete to authenticated using (public.eh_owner());

-- papéis
create policy papeis_sel on public.papeis_usuario for select to authenticated
  using (user_id = auth.uid() or public.eh_owner());
create policy papeis_all on public.papeis_usuario for all to authenticated
  using (public.eh_owner()) with check (public.eh_owner());

-- clientes
create policy clientes_sel on public.clientes for select to authenticated using (public.pode_ver_cliente(id));
create policy clientes_ins on public.clientes for insert to authenticated with check (public.tem_papel_editor());
create policy clientes_upd on public.clientes for update to authenticated
  using (public.pode_ver_cliente(id) and public.tem_papel_editor()) with check (public.tem_papel_editor());
create policy clientes_del on public.clientes for delete to authenticated using (public.eh_owner());

-- tabelas de apoio
create policy sistemas_sel on public.sistemas for select to authenticated using (public.tem_algum_papel());
create policy sistemas_wr on public.sistemas for all to authenticated
  using (public.tem_papel_gestor()) with check (public.tem_papel_gestor());
create policy categorias_sel on public.categorias_receita for select to authenticated using (public.tem_algum_papel());
create policy categorias_wr on public.categorias_receita for all to authenticated
  using (public.tem_papel_gestor()) with check (public.tem_papel_gestor());

-- tabelas com empresa_id
do $$
declare t text;
begin
  foreach t in array array['contratos','adicionais','cobrancas','vendas'] loop
    execute format('create policy %I_sel on public.%I for select to authenticated using (public.pode_ver(empresa_id))', t, t);
    execute format('create policy %I_ins on public.%I for insert to authenticated with check (public.pode_editar(empresa_id))', t, t);
    execute format('create policy %I_upd on public.%I for update to authenticated using (public.pode_editar(empresa_id)) with check (public.pode_editar(empresa_id))', t, t);
    execute format('create policy %I_del on public.%I for delete to authenticated using (public.pode_gerir(empresa_id))', t, t);
  end loop;
end $$;

create policy parametros_sel on public.parametros_limite for select to authenticated using (public.pode_ver(empresa_id));
create policy parametros_wr on public.parametros_limite for all to authenticated
  using (public.pode_gerir(empresa_id)) with check (public.pode_gerir(empresa_id));

-- tabelas filhas (acesso herdado do pai)
create policy versoes_sel on public.contrato_versoes for select to authenticated
  using (exists (select 1 from public.contratos c where c.id = contrato_id and public.pode_ver(c.empresa_id)));
create policy versoes_ins on public.contrato_versoes for insert to authenticated
  with check (exists (select 1 from public.contratos c where c.id = contrato_id and public.pode_editar(c.empresa_id)));
create policy versoes_upd on public.contrato_versoes for update to authenticated
  using (exists (select 1 from public.contratos c where c.id = contrato_id and public.pode_gerir(c.empresa_id)));
create policy versoes_del on public.contrato_versoes for delete to authenticated
  using (exists (select 1 from public.contratos c where c.id = contrato_id and public.pode_gerir(c.empresa_id)));

create policy cobad_sel on public.cobranca_adicionais for select to authenticated
  using (exists (select 1 from public.cobrancas c where c.id = cobranca_id and public.pode_ver(c.empresa_id)));
create policy cobad_wr on public.cobranca_adicionais for all to authenticated
  using (exists (select 1 from public.cobrancas c where c.id = cobranca_id and public.pode_editar(c.empresa_id)))
  with check (exists (select 1 from public.cobrancas c where c.id = cobranca_id and public.pode_editar(c.empresa_id)));

create policy pagamentos_sel on public.pagamentos for select to authenticated
  using (exists (select 1 from public.cobrancas c where c.id = cobranca_id and public.pode_ver(c.empresa_id)));
create policy pagamentos_ins on public.pagamentos for insert to authenticated
  with check (exists (select 1 from public.cobrancas c where c.id = cobranca_id and public.pode_editar(c.empresa_id)));
create policy pagamentos_upd on public.pagamentos for update to authenticated
  using (exists (select 1 from public.cobrancas c where c.id = cobranca_id and public.pode_editar(c.empresa_id)));
create policy pagamentos_del on public.pagamentos for delete to authenticated
  using (exists (select 1 from public.cobrancas c where c.id = cobranca_id and public.pode_gerir(c.empresa_id)));

create policy itens_sel on public.venda_itens for select to authenticated
  using (exists (select 1 from public.vendas v where v.id = venda_id and public.pode_ver(v.empresa_id)));
create policy itens_wr on public.venda_itens for all to authenticated
  using (exists (select 1 from public.vendas v where v.id = venda_id and public.pode_editar(v.empresa_id)))
  with check (exists (select 1 from public.vendas v where v.id = venda_id and public.pode_editar(v.empresa_id)));

create policy ajustes_sel on public.venda_ajustes for select to authenticated
  using (exists (select 1 from public.vendas v where v.id = venda_id and public.pode_ver(v.empresa_id)));
create policy ajustes_wr on public.venda_ajustes for all to authenticated
  using (exists (select 1 from public.vendas v where v.id = venda_id and public.pode_editar(v.empresa_id)))
  with check (exists (select 1 from public.vendas v where v.id = venda_id and public.pode_editar(v.empresa_id)));

-- auditoria: só o proprietário lê; ninguém escreve diretamente (apenas os triggers).
create policy auditoria_sel on public.auditoria for select to authenticated using (public.eh_owner());

-- Coerência entre empresa do contrato e empresa do adicional/cobrança/venda.
create function public.trg_checar_empresa_contrato() returns trigger language plpgsql as $$
begin
  if new.contrato_id is not null and not exists
     (select 1 from public.contratos c where c.id = new.contrato_id and c.empresa_id = new.empresa_id) then
    raise exception 'O contrato pertence a outra empresa.';
  end if;
  return new;
end $$;
create trigger adicionais_empresa before insert or update on public.adicionais
  for each row execute function public.trg_checar_empresa_contrato();
create trigger cobrancas_empresa before insert or update on public.cobrancas
  for each row execute function public.trg_checar_empresa_contrato();
