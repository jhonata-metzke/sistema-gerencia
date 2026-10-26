-- Fase 1: modelo de dados. Valores monetários sempre em numeric(14,2).

create type public.papel_app as enum ('owner', 'gestor', 'operador', 'leitor');
create type public.periodicidade as enum ('mensal', 'anual', 'unica', 'intervalo');
create type public.situacao_contrato as enum ('ativo', 'suspenso', 'encerrado');
create type public.status_cobranca as enum ('pendente', 'parcial', 'paga', 'cancelada');

-- ---------- utilitários ----------
create function public.normalizar_cnpj(t text) returns text
language sql immutable as $$
  select upper(regexp_replace(coalesce(t, ''), '[^0-9A-Za-z]', '', 'g'))
$$;

-- Valida CNPJ numérico e alfanumérico (valor do caractere = ASCII - 48).
create function public.cnpj_valido(t text) returns boolean
language plpgsql immutable as $$
declare
  c text := public.normalizar_cnpj(t);
  w1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  w2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
  s int; i int; d1 int; d2 int;
begin
  if c !~ '^[0-9A-Z]{12}[0-9]{2}$' then return false; end if;
  if c ~ '^(.)\1{13}$' then return false; end if;
  s := 0;
  for i in 1..12 loop s := s + (ascii(substr(c, i, 1)) - 48) * w1[i]; end loop;
  d1 := case when s % 11 < 2 then 0 else 11 - s % 11 end;
  s := 0;
  for i in 1..13 loop s := s + (ascii(substr(c, i, 1)) - 48) * w2[i]; end loop;
  d2 := case when s % 11 < 2 then 0 else 11 - s % 11 end;
  return d1 = substr(c, 13, 1)::int and d2 = substr(c, 14, 1)::int;
end $$;

create function public.trg_normalizar_cnpj() returns trigger language plpgsql as $$
begin
  new.cnpj := public.normalizar_cnpj(new.cnpj);
  return new;
end $$;

create function public.trg_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------- empresas e acesso ----------
create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  razao_social text not null,
  nome_fantasia text,
  cnpj text not null unique check (public.cnpj_valido(cnpj)),
  regime_tributario text not null default 'nao_informado'
    check (regime_tributario in ('MEI','Simples Nacional','Lucro Presumido','Lucro Real','nao_informado')),
  inicio_atividades date,
  situacao text not null default 'ativa' check (situacao in ('ativa','inativa')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- owner = acesso global (empresa_id nulo); demais papéis são por empresa.
create table public.papeis_usuario (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  empresa_id uuid references public.empresas(id) on delete cascade,
  papel public.papel_app not null,
  created_at timestamptz not null default now(),
  unique nulls not distinct (user_id, empresa_id),
  check ((papel = 'owner') = (empresa_id is null))
);

-- ---------- cadastros ----------
create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  razao_social text not null,
  cnpj text not null unique check (public.cnpj_valido(cnpj)),
  nome_fantasia text,
  inscricao_estadual text,
  telefone text,
  email text,
  endereco text,
  observacoes text,
  ativo boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sistemas (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ativo boolean not null default true
);

create table public.categorias_receita (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  tipo_base text not null check (tipo_base in ('mensalidade','adicional','venda')),
  ativo boolean not null default true
);

-- ---------- contratos ----------
create table public.contratos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  cliente_id uuid not null references public.clientes(id),
  sistema_id uuid references public.sistemas(id),
  categoria_id uuid references public.categorias_receita(id),
  descricao text not null,
  periodicidade public.periodicidade not null default 'mensal',
  intervalo_meses int check (intervalo_meses is null or intervalo_meses > 0),
  dia_vencimento int not null check (dia_vencimento between 1 and 31),
  mes_cobranca_anual int check (mes_cobranca_anual between 1 and 12),
  emite_nf boolean not null default false,
  inicio_em date not null,
  fim_em date,
  situacao public.situacao_contrato not null default 'ativo',
  observacoes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fim_em is null or fim_em >= inicio_em),
  check (periodicidade <> 'intervalo' or intervalo_meses is not null)
);

-- Versões de valor com vigência: o valor de uma data é o da última vigência <= data.
create table public.contrato_versoes (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos(id) on delete cascade,
  valor_base numeric(14,2) not null check (valor_base >= 0),
  vigencia_inicio date not null,
  motivo text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (contrato_id, vigencia_inicio)
);

create table public.adicionais (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  cliente_id uuid not null references public.clientes(id),
  contrato_id uuid references public.contratos(id),
  categoria_id uuid references public.categorias_receita(id),
  descricao text not null,
  valor numeric(14,2) not null check (valor > 0),
  data date not null default current_date,
  competencia date not null check (extract(day from competencia) = 1),
  periodicidade public.periodicidade not null default 'unica',
  intervalo_meses int check (intervalo_meses is null or intervalo_meses > 0),
  fim_em date,
  situacao text not null default 'ativo' check (situacao in ('ativo','encerrado','cancelado')),
  emite_nf boolean not null default false,
  observacoes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (periodicidade <> 'intervalo' or intervalo_meses is not null)
);

-- ---------- cobranças e pagamentos ----------
-- Valores são copiados na geração e nunca recalculados por mudança contratual.
-- "Prevista" = faturada_em nulo; "vencida" é derivada em v_cobrancas.
create table public.cobrancas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  cliente_id uuid not null references public.clientes(id),
  contrato_id uuid references public.contratos(id),
  tipo text not null default 'contrato' check (tipo in ('contrato','adicional')),
  competencia date not null check (extract(day from competencia) = 1),
  vencimento date not null,
  valor_base numeric(14,2) not null default 0 check (valor_base >= 0),
  valor_adicionais numeric(14,2) not null default 0 check (valor_adicionais >= 0),
  valor_total numeric(14,2) generated always as (valor_base + valor_adicionais) stored,
  faturada_em timestamptz,
  status public.status_cobranca not null default 'pendente',
  cancelada_em timestamptz,
  motivo_cancelamento text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (tipo <> 'contrato' or contrato_id is not null)
);
create unique index cobrancas_contrato_competencia_uk
  on public.cobrancas (contrato_id, competencia) where tipo = 'contrato';
create index cobrancas_empresa_competencia_ix on public.cobrancas (empresa_id, competencia);
create index cobrancas_cliente_ix on public.cobrancas (cliente_id);

create table public.cobranca_adicionais (
  cobranca_id uuid not null references public.cobrancas(id) on delete cascade,
  adicional_id uuid not null references public.adicionais(id),
  competencia date not null,
  valor numeric(14,2) not null check (valor > 0),
  primary key (adicional_id, competencia)
);
create index cobranca_adicionais_cobranca_ix on public.cobranca_adicionais (cobranca_id);

create table public.pagamentos (
  id uuid primary key default gen_random_uuid(),
  cobranca_id uuid not null references public.cobrancas(id) on delete cascade,
  data_recebimento date not null default current_date,
  valor numeric(14,2) not null check (valor > 0),
  forma text,
  observacao text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index pagamentos_cobranca_ix on public.pagamentos (cobranca_id);

-- ---------- vendas ----------
create table public.vendas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  cliente_id uuid references public.clientes(id),
  comprador_nome text,
  comprador_documento text,
  categoria_id uuid references public.categorias_receita(id),
  data_operacao date not null default current_date,
  documento text,
  status text not null default 'registrada'
    check (status in ('registrada','faturada','recebida','cancelada')),
  cancelada_em timestamptz,
  observacoes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cliente_id is not null or comprador_nome is not null)
);
create index vendas_empresa_data_ix on public.vendas (empresa_id, data_operacao);

create table public.venda_itens (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references public.vendas(id) on delete cascade,
  descricao text not null,
  quantidade numeric(14,3) not null check (quantidade > 0),
  valor_unitario numeric(14,2) not null check (valor_unitario >= 0),
  desconto numeric(14,2) not null default 0 check (desconto >= 0),
  total numeric(14,2) generated always as (round(quantidade * valor_unitario, 2) - desconto) stored,
  check (round(quantidade * valor_unitario, 2) - desconto >= 0)
);
create index venda_itens_venda_ix on public.venda_itens (venda_id);

create table public.venda_ajustes (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references public.vendas(id) on delete cascade,
  tipo text not null check (tipo in ('devolucao','estorno')),
  valor numeric(14,2) not null check (valor > 0),
  data date not null default current_date,
  motivo text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- ---------- parâmetros de limite (por empresa e ano) ----------
create table public.parametros_limite (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  ano int not null check (ano between 2000 and 2100),
  regime text,
  limite numeric(14,2) not null check (limite > 0),
  alerta_atencao numeric(5,2) not null default 70 check (alerta_atencao between 1 and 100),
  alerta_critico numeric(5,2) not null default 90 check (alerta_critico between 1 and 100),
  criterio text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, ano),
  check (alerta_atencao < alerta_critico)
);

-- ---------- auditoria ----------
create table public.auditoria (
  id bigint generated always as identity primary key,
  tabela text not null,
  registro_id text,
  acao text not null,
  usuario uuid,
  em timestamptz not null default now(),
  antes jsonb,
  depois jsonb
);
create index auditoria_tabela_registro_ix on public.auditoria (tabela, registro_id);

create function public.trg_auditoria() returns trigger
language plpgsql security definer set search_path = public as $$
declare rid text;
begin
  rid := coalesce((to_jsonb(new) ->> 'id'), (to_jsonb(old) ->> 'id'));
  insert into public.auditoria (tabela, registro_id, acao, usuario, antes, depois)
  values (tg_table_name, rid, tg_op,
          auth.uid(),
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

-- ---------- triggers ----------
create trigger empresas_cnpj before insert or update on public.empresas
  for each row execute function public.trg_normalizar_cnpj();
create trigger clientes_cnpj before insert or update on public.clientes
  for each row execute function public.trg_normalizar_cnpj();

do $$
declare t text;
begin
  foreach t in array array['empresas','clientes','contratos','adicionais','cobrancas','vendas','parametros_limite'] loop
    execute format('create trigger %I_updated before update on public.%I for each row execute function public.trg_updated_at()', t, t);
  end loop;
  foreach t in array array['empresas','papeis_usuario','clientes','contratos','contrato_versoes','adicionais','cobrancas','cobranca_adicionais','pagamentos','vendas','venda_itens','venda_ajustes','parametros_limite','sistemas','categorias_receita'] loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.trg_auditoria()', t, t);
  end loop;
end $$;
