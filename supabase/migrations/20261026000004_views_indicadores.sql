-- Critérios de faturamento (ver docs/criterios-faturamento.md). Todas as views respeitam a RLS.

-- Categoria padrão por tipo quando o registro não tem categoria própria.
create function public.categoria_padrao(p_tipo text) returns uuid
language sql stable as $$
  select id from public.categorias_receita where tipo_base = p_tipo and ativo order by nome limit 1
$$;

-- Receitas elegíveis, uma linha por componente. Pagamentos NÃO entram aqui.
create view public.v_receitas with (security_invoker = true) as
  -- mensalidades (valor base de cobranças faturadas e não canceladas)
  select 'cobranca:' || c.id as chave, c.empresa_id, c.cliente_id, 'mensalidade'::text as tipo,
         coalesce(ct.categoria_id, public.categoria_padrao('mensalidade')) as categoria_id,
         c.competencia, c.competencia as data_ref, c.valor_base as valor,
         'cobrancas'::text as origem, c.id as origem_id,
         coalesce(ct.descricao, 'Mensalidade') as descricao
  from public.cobrancas c
  left join public.contratos ct on ct.id = c.contrato_id
  where c.status <> 'cancelada' and c.faturada_em is not null and c.valor_base > 0
  union all
  -- adicionais (valores vinculados às cobranças faturadas e não canceladas)
  select 'adicional:' || ca.adicional_id || ':' || ca.competencia, c.empresa_id, c.cliente_id, 'adicional',
         coalesce(a.categoria_id, public.categoria_padrao('adicional')),
         c.competencia, c.competencia, ca.valor, 'adicionais', a.id, a.descricao
  from public.cobranca_adicionais ca
  join public.cobrancas c on c.id = ca.cobranca_id
  join public.adicionais a on a.id = ca.adicional_id
  where c.status <> 'cancelada' and c.faturada_em is not null
  union all
  -- vendas faturadas ou recebidas
  select 'venda:' || v.id, v.empresa_id, v.cliente_id, 'venda',
         coalesce(v.categoria_id, public.categoria_padrao('venda')),
         date_trunc('month', v.data_operacao)::date, v.data_operacao, public.total_venda(v.id),
         'vendas', v.id, coalesce(v.documento, 'Venda de mercadorias')
  from public.vendas v
  where v.status in ('faturada', 'recebida') and public.total_venda(v.id) > 0
  union all
  -- devoluções e estornos reduzem o faturamento de vendas no mês do ajuste
  select 'ajuste:' || j.id, v.empresa_id, v.cliente_id, 'venda',
         coalesce(v.categoria_id, public.categoria_padrao('venda')),
         date_trunc('month', j.data)::date, j.data, -j.valor,
         'venda_ajustes', j.id, initcap(j.tipo) || ' de venda'
  from public.venda_ajustes j
  join public.vendas v on v.id = j.venda_id
  where v.status in ('faturada', 'recebida');

-- Itens cancelados/estornados, exibidos à parte (nunca misturados ao faturamento).
create view public.v_cancelamentos with (security_invoker = true) as
  select 'cobranca:' || c.id as chave, c.empresa_id, c.cliente_id, 'cobranca_cancelada'::text as tipo,
         c.competencia, c.valor_total as valor, c.motivo_cancelamento as motivo
  from public.cobrancas c where c.status = 'cancelada'
  union all
  select 'venda:' || v.id, v.empresa_id, v.cliente_id, 'venda_cancelada',
         date_trunc('month', v.data_operacao)::date, public.total_venda(v.id), v.observacoes
  from public.vendas v where v.status = 'cancelada'
  union all
  select 'ajuste:' || j.id, v.empresa_id, v.cliente_id, j.tipo,
         date_trunc('month', j.data)::date, j.valor, j.motivo
  from public.venda_ajustes j join public.vendas v on v.id = j.venda_id;

create view public.v_faturamento_mensal with (security_invoker = true) as
  select empresa_id, extract(year from competencia)::int as ano, extract(month from competencia)::int as mes,
         tipo, categoria_id, sum(valor)::numeric(14,2) as valor, count(*) as registros
  from public.v_receitas
  group by 1, 2, 3, 4, 5;

create view public.v_cobrancas with (security_invoker = true) as
  select c.*, cl.razao_social as cliente_razao_social, cl.cnpj as cliente_cnpj,
         coalesce(p.pago, 0)::numeric(14,2) as valor_pago,
         case when c.status = 'cancelada' then 0 else c.valor_total - coalesce(p.pago, 0) end::numeric(14,2) as valor_pendente,
         (c.status in ('pendente','parcial') and c.faturada_em is not null and c.vencimento < current_date) as vencida,
         case
           when c.status = 'cancelada' then 'cancelada'
           when c.status = 'paga' then 'paga'
           when c.faturada_em is null then 'prevista'
           when c.status = 'parcial' then 'parcialmente_paga'
           when c.vencimento < current_date then 'vencida'
           else 'pendente' end as status_exibicao
  from public.cobrancas c
  join public.clientes cl on cl.id = c.cliente_id
  left join lateral (select sum(valor) as pago from public.pagamentos where cobranca_id = c.id) p on true;

-- Lista simplificada de mensalidades (4 colunas principais + chaves).
create view public.v_contratos_lista with (security_invoker = true) as
  select ct.*, cl.razao_social as cliente_razao_social, cl.cnpj as cliente_cnpj,
         public.valor_contrato_em(ct.id, current_date) as valor_atual,
         s.nome as sistema_nome, e.nome_fantasia as empresa_nome, e.razao_social as empresa_razao_social
  from public.contratos ct
  join public.clientes cl on cl.id = ct.cliente_id
  join public.empresas e on e.id = ct.empresa_id
  left join public.sistemas s on s.id = ct.sistema_id;

-- Indicadores de cobrança por empresa e intervalo de competências (valores nunca se somam ao faturamento).
create function public.indicadores_cobranca(p_empresa uuid, p_inicio date, p_fim date)
returns table (empresa_id uuid, qtd bigint, previsto numeric, faturado numeric, recebido numeric,
               pendente numeric, vencido numeric, qtd_vencidas bigint)
language sql stable as $$
  select c.empresa_id, count(*),
    coalesce(sum(c.valor_total) filter (where c.faturada_em is null and c.status <> 'cancelada'), 0),
    coalesce(sum(c.valor_total) filter (where c.faturada_em is not null and c.status <> 'cancelada'), 0),
    coalesce(sum(c.valor_pago) filter (where c.status <> 'cancelada'), 0),
    coalesce(sum(c.valor_pendente) filter (where c.faturada_em is not null), 0),
    coalesce(sum(c.valor_pendente) filter (where c.vencida), 0),
    count(*) filter (where c.vencida)
  from public.v_cobrancas c
  where (p_empresa is null or c.empresa_id = p_empresa)
    and c.competencia between date_trunc('month', p_inicio)::date and date_trunc('month', p_fim)::date
  group by c.empresa_id
$$;

create function public.resumo_contratos(p_empresa uuid)
returns table (empresa_id uuid, contratos_ativos bigint, mensalidades_contratadas numeric, outros_contratos_valor numeric)
language sql stable as $$
  select l.empresa_id, count(*),
    coalesce(sum(l.valor_atual) filter (where l.periodicidade = 'mensal'), 0),
    coalesce(sum(l.valor_atual) filter (where l.periodicidade <> 'mensal'), 0)
  from public.v_contratos_lista l
  where l.situacao = 'ativo' and (p_empresa is null or l.empresa_id = p_empresa)
  group by l.empresa_id
$$;

-- Acompanhamento do limite por CNPJ. Projeção é ESTIMATIVA (média mensal x 12).
create function public.limite_situacao(p_empresa uuid, p_ano int)
returns table (empresa_id uuid, ano int, regime text, limite numeric, alerta_atencao numeric, alerta_critico numeric,
               acumulado numeric, saldo numeric, percentual numeric, nivel text, projecao_anual numeric)
language sql stable as $$
  with meses as (
    select case when p_ano < extract(year from current_date)::int then 12
                when p_ano > extract(year from current_date)::int then 1
                else extract(month from current_date)::int end as n
  ), acum as (
    select e.id as empresa_id, coalesce(sum(r.valor), 0)::numeric(14,2) as acumulado
    from public.empresas e
    left join public.v_receitas r on r.empresa_id = e.id and extract(year from r.competencia)::int = p_ano
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
