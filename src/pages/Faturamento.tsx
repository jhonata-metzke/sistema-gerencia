import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabase } from '@/lib/supabase'
import { intervaloCompetencia, ok, useCategorias, useClientes } from '@/lib/dados'
import { useEmpresa } from '@/lib/empresa-context'
import { TIPOS, filtrar, total, useCancelamentosAno, useFaturamentoAno } from '@/lib/faturamento'
import { DEFINICOES } from '@/lib/definicoes'
import { dec, moeda, percentual, somar } from '@/lib/money'
import { competencia, data, MESES } from '@/lib/datas'
import type { Receita } from '@/lib/types'
import { Carregando, ErroBox, PageHeader, Secao, StatCard, Tabela } from '@/components/ui'
import { SeletorAno, SeletorMes } from '@/components/FiltroPeriodo'

const ROTULO_CANC: Record<string, string> = { cobranca_cancelada: 'Cobrança cancelada', venda_cancelada: 'Venda cancelada', devolucao: 'Devolução', estorno: 'Estorno' }

export default function Faturamento() {
  const { empresaId, nomeEmpresa } = useEmpresa()
  const hojeD = new Date()
  const [ano, setAno] = useState(hojeD.getFullYear())
  const [mes, setMes] = useState(0)
  const [categoriaId, setCategoriaId] = useState('')
  const [tipo, setTipo] = useState('')
  const categorias = useCategorias()
  const clientes = useClientes()
  const atual = useFaturamentoAno(empresaId, ano)
  const anterior = useFaturamentoAno(empresaId, ano - 1)
  const canc = useCancelamentosAno(empresaId, ano)

  const [ini, fim] = intervaloCompetencia(ano, mes)
  const registros = useQuery({
    queryKey: ['receitas', empresaId, ano, mes, categoriaId, tipo],
    queryFn: async () => {
      let r = supabase.from('v_receitas').select('*').gte('competencia', ini).lte('competencia', fim).order('data_ref').limit(1000)
      if (empresaId) r = r.eq('empresa_id', empresaId)
      if (categoriaId) r = r.eq('categoria_id', categoriaId)
      if (tipo) r = r.eq('tipo', tipo)
      return ok(await r) as Receita[]
    },
  })

  if (atual.isLoading) return <Carregando />
  if (atual.error) return <ErroBox erro={atual.error} />
  const f = { categoriaId: categoriaId || undefined, tipo: tipo || undefined }
  const L = atual.data ?? []
  const P = anterior.data ?? []
  const periodo = filtrar(L, { ...f, mes })
  const nomeCli = (id: string | null) => (id ? clientes.data?.find((c) => c.id === id)?.razao_social : null) ?? '—'
  const cancs = (canc.data ?? []).filter((c) => mes === 0 || Number(c.competencia.slice(5, 7)) === mes)

  const meses = MESES.map((m, i) => {
    const a = total(filtrar(L, { ...f, mes: i + 1 })); const p = total(filtrar(P, { ...f, mes: i + 1 }))
    return { i: i + 1, mes: m, atual: a, anterior: p, mens: total(filtrar(L, { ...f, mes: i + 1, tipo: 'mensalidade' })), adic: total(filtrar(L, { ...f, mes: i + 1, tipo: 'adicional' })), venda: total(filtrar(L, { ...f, mes: i + 1, tipo: 'venda' })) }
  })
  const variacao = (a: ReturnType<typeof dec>, p: ReturnType<typeof dec>) => (p.isZero() ? '—' : percentual(a.minus(p).div(p).times(100)))
  const temAnterior = P.length > 0

  return (
    <>
      <PageHeader titulo="Faturamento" subtitulo={`${empresaId ? nomeEmpresa(empresaId) : 'Todas as empresas (consolidado)'} — calculado automaticamente a partir de mensalidades, adicionais e vendas`} />
      <div className="mb-4 flex flex-wrap gap-2">
        <SeletorAno valor={ano} onChange={setAno} /><SeletorMes valor={mes} onChange={setMes} todos />
        <select className="input w-auto" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} aria-label="Categoria"><option value="">Todas as categorias</option>{(categorias.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
        <select className="input w-auto" value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo de operação"><option value="">Todos os tipos</option>{Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard titulo={mes ? `Faturamento de ${MESES[mes - 1]}` : `Faturamento de ${ano}`} valor={moeda(total(periodo))} hint={mes ? DEFINICOES.faturamentoMes : DEFINICOES.faturamentoAno} />
        <StatCard titulo="Mensalidades" valor={moeda(total(filtrar(periodo, { tipo: 'mensalidade' })))} hint={DEFINICOES.mensalidades} />
        <StatCard titulo="Adicionais" valor={moeda(total(filtrar(periodo, { tipo: 'adicional' })))} hint={DEFINICOES.adicionais} />
        <StatCard titulo="Vendas de mercadorias" valor={moeda(total(filtrar(periodo, { tipo: 'venda' })))} hint={DEFINICOES.vendas} />
      </div>

      <div className="card mb-5 text-sub">
        <h3 className="mb-2 text-sm font-semibold text-fg">Evolução mensal{temAnterior ? ` — ${ano} x ${ano - 1}` : ` — ${ano}`}</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={meses.map((m) => ({ mes: m.mes.slice(0, 3), [String(ano)]: m.atual.toNumber(), [String(ano - 1)]: m.anterior.toNumber() }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.2} /><XAxis dataKey="mes" tick={{ fill: 'currentColor', fontSize: 12 }} /><YAxis tick={{ fill: 'currentColor', fontSize: 12 }} width={70} tickFormatter={(v: number) => moeda(v).replace(',00', '')} />
            <Tooltip formatter={(v) => moeda(Number(v))} /><Legend />
            <Bar dataKey={String(ano)} fill="#2563eb" />{temAnterior && <Bar dataKey={String(ano - 1)} fill="#94a3b8" />}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <Secao titulo="Faturamento por mês">
        <Tabela linhas={meses} chave={(m) => String(m.i)} aoClicar={(m) => setMes(m.i)}
          colunas={[
            { titulo: 'Mês', render: (m) => m.mes }, { titulo: 'Mensalidades', alinhar: 'right', render: (m) => moeda(m.mens) },
            { titulo: 'Adicionais', alinhar: 'right', render: (m) => moeda(m.adic) }, { titulo: 'Vendas', alinhar: 'right', render: (m) => moeda(m.venda) },
            { titulo: 'Total', alinhar: 'right', className: 'font-semibold', render: (m) => moeda(m.atual) },
            ...(temAnterior ? [{ titulo: `${ano - 1}`, alinhar: 'right' as const, render: (m: (typeof meses)[number]) => moeda(m.anterior) }, { titulo: 'Variação', alinhar: 'right' as const, render: (m: (typeof meses)[number]) => variacao(m.atual, m.anterior) }] : []),
          ]} />
        <p className="mt-1 text-xs text-sub">Clique em um mês para filtrar os registros abaixo. Total do ano: <strong>{moeda(total(filtrar(L, f)))}</strong>.</p>
      </Secao>

      <Secao titulo={`Registros que compõem o total${mes ? ` — ${MESES[mes - 1]}` : ''}`}>
        {registros.error ? <ErroBox erro={registros.error} /> : (
          <Tabela linhas={registros.data ?? []} chave={(r) => r.chave}
            colunas={[
              { titulo: 'Data', render: (r) => data(r.data_ref) }, { titulo: 'Tipo', render: (r) => TIPOS[r.tipo] }, { titulo: 'Cliente', render: (r) => nomeCli(r.cliente_id) },
              ...(empresaId ? [] : [{ titulo: 'Empresa', render: (r: Receita) => nomeEmpresa(r.empresa_id) }]),
              { titulo: 'Descrição', render: (r) => r.descricao ?? '—' }, { titulo: 'Valor', alinhar: 'right', render: (r) => moeda(r.valor) },
            ]} />
        )}
        {(registros.data?.length ?? 0) >= 1000 && <p className="mt-1 text-xs text-warn">Exibindo os primeiros 1.000 registros; filtre por mês ou tipo para ver o restante.</p>}
      </Secao>

      <Secao titulo="Cancelamentos, devoluções e estornos (fora do faturamento)">
        <div className="mb-2 text-sm">Total: <strong>{moeda(somar(cancs.map((c) => c.valor)))}</strong></div>
        <Tabela linhas={cancs} chave={(c) => c.chave} vazio="Nenhum cancelamento ou estorno no período."
          colunas={[{ titulo: 'Competência', render: (c) => competencia(c.competencia) }, { titulo: 'Tipo', render: (c) => ROTULO_CANC[c.tipo] ?? c.tipo }, { titulo: 'Cliente', render: (c) => nomeCli(c.cliente_id) }, ...(empresaId ? [] : [{ titulo: 'Empresa', render: (c: (typeof cancs)[number]) => nomeEmpresa(c.empresa_id) }]), { titulo: 'Valor', alinhar: 'right', render: (c) => moeda(c.valor) }]} />
      </Secao>
    </>
  )
}
