create table t_res (n serial, nome text, ok boolean, detalhe text);
create table t_ids (k text primary key, id uuid not null);
grant all on t_res, t_ids to authenticated;
grant usage on sequence t_res_n_seq to authenticated;

create function t_ok(p_nome text, p_cond boolean, p_det text default null) returns void
language sql security definer as $$ insert into t_res (nome, ok, detalhe) values (p_nome, coalesce(p_cond, false), p_det) $$;

create function t_id(p_k text) returns uuid language sql security definer as $$ select id from t_ids where k = p_k $$;

create function t_login(p_user text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', t_id(p_user)::text, true);
  execute 'set local role authenticated';
end $$;
create function t_logout() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', true); end $$;

create function t_raises(p_nome text, p_stmt text) returns void language plpgsql as $$
begin
  execute p_stmt;
  perform t_ok(p_nome, false, 'esperava erro e a operação foi aceita');
exception when others then
  perform t_ok(p_nome, true, sqlerrm);
end $$;

create function t_eq(p_nome text, p_atual anyelement, p_esperado anyelement) returns void language plpgsql as $$
begin
  perform t_ok(p_nome, p_atual is not distinct from p_esperado, 'atual=' || coalesce(p_atual::text,'null') || ' esperado=' || coalesce(p_esperado::text,'null'));
end $$;

-- Operação bloqueada = erro OU nenhuma linha afetada (comportamento da RLS em UPDATE/DELETE).
create function t_bloqueado(p_nome text, p_stmt text) returns void language plpgsql as $$
declare n bigint;
begin
  execute p_stmt;
  get diagnostics n = row_count;
  perform t_ok(p_nome, n = 0, 'linhas afetadas=' || n);
exception when others then
  perform t_ok(p_nome, true, sqlerrm);
end $$;
