-- Reajuste em lote, faturamento anterior ao sistema no limite e cadastro somente por convite.

-- ---------- faturamento já realizado no ano antes do sistema (entra só no acompanhamento do limite) ----------
alter table public.parametros_limite
  add column faturamento_anterior numeric(14,2) not null default 0 check (faturamento_anterior >= 0);

create or replace function public.limite_situacao(p_empresa uuid, p_ano int)
returns table (empresa_id uuid, ano int, regime text, limite numeric, alerta_atencao numeric, alerta_critico numeric,
               acumulado numeric, saldo numeric, percentual numeric, nivel text, projecao_anual numeric)
language sql stable as $$
  with meses as (
    select case when p_ano < extract(year from current_date)::int then 12
                when p_ano > extract(year from current_date)::int then 1
                else extract(month from current_date)::int end as n
  ), acum as (
    select e.id as empresa_id,
           (coalesce(sum(r.valor), 0) + coalesce(max(pl0.faturamento_anterior), 0))::numeric(14,2) as acumulado
    from public.empresas e
    left join public.v_receitas r on r.empresa_id = e.id and extract(year from r.competencia)::int = p_ano
    left join public.parametros_limite pl0 on pl0.empresa_id = e.id and pl0.ano = p_ano
    where p_empresa is null or e.id = p_empresa
    group by e.id
  )
  select a.empresa_id, p_ano, coalesce(pl.regime, e.regime_tributario), pl.limite, pl.alerta_atencao, pl.alerta_critico,
         a.acumulado,
         case when pl.limite is null then null else pl.limite - a.acumulado end,
         case when pl.limite is null then null else round(a.acumulado / pl.limite * 100, 2) end,
         case when pl.limite is null then 'sem_parametro'
              when a.acumulado > pl.limite then 'ultrapassado'
              when a.acumulado >= pl.limite * pl.alerta_critico / 100 then 'critico'
              when a.acumulado >= pl.limite * pl.alerta_atencao / 100 then 'atencao'
              else 'ok' end,
         round(a.acumulado / (select n from meses) * 12, 2)
  from acum a
  join public.empresas e on e.id = a.empresa_id
  left join public.parametros_limite pl on pl.empresa_id = a.empresa_id and pl.ano = p_ano
$$;

-- ---------- reajuste em lote ----------
create function public.reajustar_contratos(p_ids uuid[], p_percentual numeric, p_vigencia date, p_motivo text default null)
returns int language plpgsql as $$
declare k uuid; v numeric; novo numeric; n int := 0;
begin
  if p_percentual is null or p_percentual <= -100 then raise exception 'Percentual inválido.'; end if;
  foreach k in array p_ids loop
    v := public.valor_contrato_em(k, p_vigencia);
    continue when v is null;
    novo := round(v * (1 + p_percentual / 100), 2);
    insert into public.contrato_versoes (contrato_id, valor_base, vigencia_inicio, motivo)
    values (k, novo, p_vigencia, coalesce(nullif(trim(p_motivo), ''), 'Reajuste de ' || p_percentual || '%'))
    on conflict (contrato_id, vigencia_inicio) do update set valor_base = excluded.valor_base, motivo = excluded.motivo;
    n := n + 1;
  end loop;
  return n;
end $$;

create function public.contar_cobrancas_abertas_lote(p_ids uuid[], p_vigencia date) returns int
language sql stable as $$
  select coalesce(sum(public.contar_cobrancas_abertas(k, p_vigencia)), 0)::int from unnest(p_ids) k
$$;

create function public.atualizar_cobrancas_abertas_lote(p_ids uuid[], p_vigencia date) returns int
language plpgsql as $$
declare k uuid; n int := 0;
begin
  foreach k in array p_ids loop n := n + public.atualizar_cobrancas_abertas(k, p_vigencia); end loop;
  return n;
end $$;

-- ---------- cadastro somente por convite ----------
create table public.convites (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email)),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  papel public.papel_app not null check (papel <> 'owner'),
  created_at timestamptz not null default now(),
  unique (email, empresa_id)
);
alter table public.convites enable row level security;
revoke all on public.convites from anon, authenticated;

create function public.bloquear_cadastro_sem_convite() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.convites where email = lower(new.email)) then return new; end if;
  raise exception 'Cadastro não autorizado: peça um convite ao proprietário do sistema.';
end $$;

create function public.conceder_convites() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.papeis_usuario (user_id, empresa_id, papel)
  select new.id, c.empresa_id, c.papel from public.convites c where c.email = lower(new.email)
  on conflict (user_id, empresa_id) do nothing;
  delete from public.convites where email = lower(new.email);
  return new;
end $$;

create trigger bloquear_cadastro before insert on auth.users
  for each row execute function public.bloquear_cadastro_sem_convite();
create trigger conceder_convites after insert on auth.users
  for each row execute function public.conceder_convites();

-- Concede o papel na hora se a conta existe; senão registra o convite para quando a pessoa criar a conta.
create function public.convidar(p_email text, p_empresa uuid, p_papel public.papel_app) returns text
language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(p_email));
begin
  if not public.eh_owner() then raise exception 'Apenas o proprietário pode convidar usuários.'; end if;
  if p_papel = 'owner' then raise exception 'O papel de proprietário não pode ser atribuído por aqui.'; end if;
  if p_empresa is null then raise exception 'Informe a empresa.'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'E-mail inválido.'; end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    perform public.atribuir_papel(v_email, p_empresa, p_papel);
    return 'concedido';
  end if;
  insert into public.convites (email, empresa_id, papel) values (v_email, p_empresa, p_papel)
  on conflict (email, empresa_id) do update set papel = excluded.papel;
  return 'convidado';
end $$;

create function public.listar_convites() returns table (id uuid, email text, empresa_id uuid, papel public.papel_app)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.eh_owner() then raise exception 'Apenas o proprietário pode listar convites.'; end if;
  return query select c.id, c.email, c.empresa_id, c.papel from public.convites c order by c.created_at;
end $$;

create function public.remover_convite(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_owner() then raise exception 'Apenas o proprietário pode remover convites.'; end if;
  delete from public.convites where id = p_id;
end $$;

revoke execute on function public.convidar(text, uuid, public.papel_app), public.listar_convites(), public.remover_convite(uuid) from public, anon;
grant execute on function public.convidar(text, uuid, public.papel_app), public.listar_convites(), public.remover_convite(uuid) to authenticated;
