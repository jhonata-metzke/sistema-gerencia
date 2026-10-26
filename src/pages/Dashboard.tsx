import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabase } from '@/lib/supabase'
import { ok, useCategorias } from '@/lib/dados'
import { useEmpresa } from '@/lib/empresa-context'
import { filtrar, total, useFaturamentoAno, useIndicadoresCobranca, useLimites, useResumoContratos } from '@/lib/faturamento'
import { DEFINICOES } from '@/lib/definicoes'
import { moeda, percentual, somar } from '@/lib/money'
import { competencia, data, MESES, primeiroDia } from '@/lib/datas'
import { formatarCnpj } from '@/lib/cnpj'
import type Decimal from 'decimal.js'
import type { CobrancaView, StatusExibicao } from '@/lib/types'
import { Badge, Carregando, ErroBox, KpiCard, MesesPills, PageHeader, Secao, StatCard, Tabela } from '@/components/ui'
import { SeletorAno } from '@/components/FiltroPeriodo'

const NIVEL_COR: Record<string, string> = { ok: 'bg-ok', atencao: 'bg-warn', critico: 'bg-bad', ultrapassado: 'bg-bad' }

export default function Dashboard() {
  const { empresaId, empresas, nomeEmpresa } = useEmpresa()
  const hojeD = new Date()
  const [ano, setAno] = useState(hojeD.getFullYear())
  const [mes, setMes] = useState(hojeD.getMonth() + 1)
  const [categoriaId, setCategoriaId] = useState('')
  const [situacao, setSituacao] = useState<StatusExibicao | ''>('')
  const categorias = useCategorias()
  const fat = useFaturamentoAno(empresaId, ano)
  const lim = useLimites(empresaId, ano)
  const ind = useIndicadoresCobranca(empresaId, primeiroDia(ano, mes), primeiroDia(ano, mes))
  const contratos = useResumoContratos(empresaId)

  const listas = useQuery({
    queryKey: ['dash-listas', empresaId, situacao],
    queryFn: async () => {
      const base = () => { let r = supabase.from('v_cobrancas').select('*'); if (empresaId) r = r.eq('empresa_id', empresaId); return r }
      let prox = base().in('status_exibicao', ['pendente', 'parcialmente_paga']).gte('vencimento', new Date().toISOString().slice(0, 10)).order('vencimento').limit(8)
      if (situacao) prox = base().eq('status_exibicao', situacao).order('vencimento', { ascending: false }).limit(8)
      const atrasadas = base().eq('vencida', true).order('vencimento').limit(100)
      return { prox: ok(await prox) as CobrancaView[], atrasadas: ok(await atrasadas) as CobrancaView[] }
    },
  })

  if (fat.isLoading || lim.isLoading) return <Carregando />
  if (fat.error) return <ErroBox erro={fat.error} />
  const linhas = fat.data ?? []
  const fc = { categoriaId: categoriaId || undefined }
  const doMes = filtrar(linhas, { ...fc, mes })
  const doAno = filtrar(linhas, { ...fc, mesAte: mes })
  const porTipo = (l: typeof linhas, t: string) => total(filtrar(l, { tipo: t }))
  const indTot = (k: 'qtd' | 'previsto' | 'faturado' | 'recebido' | 'pendente' | 'vencido' | 'qtd_vencidas') => somar((ind.data ?? []).map((i) => i[k]))
  const contratado = somar((contratos.data ?? []).map((c) => c.mensalidades_contratadas))
  const nContratos = (contratos.data ?? []).reduce((a, c) => a + Number(c.contratos_ativos), 0)

  const anterior = mes > 1 ? filtrar(linhas, { ...fc, mes: mes - 1 }) : null
  const variacao = (atual: Decimal, tipo?: string): number | null => {
    if (!anterior) return null
    const base = tipo ? porTipo(anterior, tipo) : total(anterior)
    return base.isZero() ? null : atual.minus(base).div(base).times(100).toNumber()
  }
  const evolucao = MESES.map((m, i) => {
    const l = filtrar(linhas, { ...fc, mes: i + 1 })
    return { mes: m.slice(0, 3), total: total(l).toNumber(), mensalidade: porTipo(l, 'mensalidade').toNumber(), adicional: porTipo(l, 'adicional').toNumber(), venda: porTipo(l, 'venda').toNumber() }
  })
  const porEmpresa = (empresaId ? empresas.filter((e) => e.id === empresaId) : empresas).map((e) => ({
    id: e.id, nome: e.nome_fantasia || e.razao_social,
    mes: total(filtrar(linhas, { ...fc, mes, empresaId: e.id })).toNumber(), ano: total(filtrar(linhas, { ...fc, mesAte: mes, empresaId: e.id })).toNumber(),
  }))
  const porCategoria = (categorias.data ?? []).map((c) => ({ nome: c.nome, valor: total(filtrar(linhas, { mesAte: mes, categoriaId: c.id })).toNumber() })).filter((c) => c.valor !== 0)
  const alertas = (lim.data ?? []).filter((l) => ['atencao', 'critico', 'ultrapassado'].includes(l.nivel))

  return (
    <>
      <PageHeader titulo="Dashboard Master" subtitulo={empresaId ? `Empresa: ${nomeEmpresa(empresaId)}` : 'Visão consolidada das empresas, sem duplicidade'} />
      <div className="card mb-4 space-y-3">
        <div className="text-sm text-sub">Filtrar por mês:</div>
        <MesesPills valor={mes} onChange={setMes} nomes={MESES} />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-sub">Ano:</span>
          <SeletorAno valor={ano} onChange={setAno} />
          <select className="input w-auto" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} aria-label="Categoria de receita">
            <option value="">Todas as categorias</option>{(categorias.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <select className="input w-auto" value={situacao} onChange={(e) => setSituacao(e.target.value as StatusExibicao | '')} aria-label="Situação da cobrança (lista de vencimentos)">
            <option value="">Situação da cobrança: padrão</option>
            {['prevista', 'pendente', 'parcialmente_paga', 'paga', 'vencida', 'cancelada'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
        </div>
      </div>

      {alertas.length > 0 && (
        <div className="mb-4 space-y-2" role="alert">
          {alertas.map((a) => (
            <div key={a.empresa_id} className={`rounded-md border p-3 text-sm ${a.nivel === 'atencao' ? 'border-warn text-warn' : 'border-bad text-bad'}`}>
              <strong>{nomeEmpresa(a.empresa_id)}:</strong> {a.nivel === 'ultrapassado' ? 'limite configurado ultrapassado' : `${percentual(a.percentual)} do limite configurado utilizado`} — saldo {moeda(a.saldo)}.
            </div>
          ))}
        </div>
      )}

      <Secao titulo={`Faturamento — ${MESES[mes - 1]} de ${ano}`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <KpiCard icone="dinheiro" titulo="Faturamento do mês" valor={moeda(total(doMes))} variacao={variacao(total(doMes))} hint={DEFINICOES.faturamentoMes} />
          <KpiCard icone="grafico" titulo="Acumulado no ano" valor={moeda(total(doAno))} detalhe={`jan a ${MESES[mes - 1].slice(0, 3).toLowerCase()}`} hint={DEFINICOES.faturamentoAno} />
          <KpiCard icone="contrato" titulo="Mensalidades contratadas" valor={moeda(contratado)} detalhe={`${nContratos} contrato(s) ativo(s)`} hint={DEFINICOES.mensalidadesContratadas} />
          <KpiCard icone="contrato" titulo="Receita de mensalidades" valor={moeda(porTipo(doMes, 'mensalidade'))} variacao={variacao(porTipo(doMes, 'mensalidade'), 'mensalidade')} hint={DEFINICOES.mensalidades} />
          <KpiCard icone="pacote" titulo="Receita de adicionais" valor={moeda(porTipo(doMes, 'adicional'))} variacao={variacao(porTipo(doMes, 'adicional'), 'adicional')} hint={DEFINICOES.adicionais} />
          <KpiCard icone="carrinho" titulo="Receita de vendas" valor={moeda(porTipo(doMes, 'venda'))} variacao={variacao(porTipo(doMes, 'venda'), 'venda')} hint={DEFINICOES.vendas} />
        </div>
      </Secao>

      <Secao titulo="Cobranças do mês">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard titulo="Previstas" valor={moeda(indTot('previsto'))} hint={DEFINICOES.previsto} />
          <StatCard titulo="Faturadas" valor={moeda(indTot('faturado'))} hint={DEFINICOES.faturado} />
          <StatCard titulo="Recebidas" valor={moeda(indTot('recebido'))} tom="ok" hint={DEFINICOES.recebido} />
          <StatCard titulo="Pendentes" valor={moeda(indTot('pendente'))} tom={indTot('pendente').gt(0) ? 'warn' : undefined} hint={DEFINICOES.pendente} />
          <StatCard titulo="Vencidas" valor={moeda(indTot('vencido'))} detalhe={`${indTot('qtd_vencidas')} cobrança(s)`} tom={indTot('vencido').gt(0) ? 'bad' : undefined} hint={DEFINICOES.vencido} />
        </div>
      </Secao>

      <Secao titulo="Por empresa (CNPJ)">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {porEmpresa.map((e) => {
            const l = lim.data?.find((x) => x.empresa_id === e.id)
            return (
              <div key={e.id} className="card">
                <div className="mb-2 font-medium">{e.nome}</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><div className="text-xs text-sub">No mês</div><div className="font-semibold tabular-nums">{moeda(e.mes)}</div></div>
                  <div><div className="text-xs text-sub">No ano</div><div className="font-semibold tabular-nums">{moeda(e.ano)}</div></div>
                </div>
                {l && l.nivel !== 'sem_parametro' ? (
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-xs"><span>Limite utilizado</span><span><Badge valor={l.nivel} /> {percentual(l.percentual)}</span></div>
                    <div className="h-2 rounded-full bg-muted"><div className={`h-2 rounded-full ${NIVEL_COR[l.nivel]}`} style={{ width: `${Math.min(100, Number(l.percentual ?? 0))}%` }} /></div>
                    <div className="mt-1 text-xs text-sub">Saldo {moeda(l.saldo)} de {moeda(l.limite)}</div>
                  </div>
                ) : <div className="mt-3 text-xs text-sub">Sem limite configurado para {ano}. <Link to="/limite-mei" className="text-brand underline">Configurar</Link></div>}
              </div>
            )
          })}
          {!porEmpresa.length && <div className="card text-sm text-sub">Nenhuma empresa cadastrada. <Link className="text-brand underline" to="/empresas">Cadastrar</Link></div>}
        </div>
      </Secao>

      <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="card text-sub">
          <h3 className="mb-2 text-lg font-semibold text-fg">Faturamento mensal — {ano}</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={evolucao}><CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.2} vertical={false} /><XAxis dataKey="mes" tick={{ fill: 'currentColor', fontSize: 12 }} /><YAxis tick={{ fill: 'currentColor', fontSize: 12 }} width={80} tickFormatter={(v: number) => moeda(v).replace(',00', '')} />
              <Tooltip formatter={(v) => moeda(Number(v))} />
              <Line type="monotone" dataKey="total" name="Faturamento" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3, fill: '#4f46e5' }} activeDot={{ r: 5 }} /></LineChart>
          </ResponsiveContainer>
        </div>
        <div className="card text-sub">
          <h3 className="mb-2 text-lg font-semibold text-fg">Comparação entre CNPJs</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={porEmpresa}><defs><linearGradient id="gradMes" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b82f6" /><stop offset="100%" stopColor="#bfdbfe" /></linearGradient><linearGradient id="gradAno" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b5cf6" /><stop offset="100%" stopColor="#ddd6fe" /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.2} vertical={false} /><XAxis dataKey="nome" tick={{ fill: 'currentColor', fontSize: 12 }} /><YAxis tick={{ fill: 'currentColor', fontSize: 12 }} width={70} tickFormatter={(v: number) => moeda(v).replace(',00', '')} />
              <Tooltip formatter={(v) => moeda(Number(v))} /><Legend />
              <Bar dataKey="mes" name={`${MESES[mes - 1]}`} fill="url(#gradMes)" radius={[6, 6, 0, 0]} /><Bar dataKey="ano" name="Acumulado no ano" fill="url(#gradAno)" radius={[6, 6, 0, 0]} /></BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card text-sub">
          <h3 className="mb-2 text-sm font-semibold text-fg">Composição por categoria (acumulado no ano)</h3>
          {porCategoria.length ? (
            <ResponsiveContainer width="100%" height={Math.max(120, porCategoria.length * 48)}>
              <BarChart data={porCategoria} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.2} /><XAxis type="number" tick={{ fill: 'currentColor', fontSize: 12 }} tickFormatter={(v: number) => moeda(v).replace(',00', '')} /><YAxis type="category" dataKey="nome" width={140} tick={{ fill: 'currentColor', fontSize: 12 }} />
                <Tooltip formatter={(v) => moeda(Number(v))} /><Bar dataKey="valor" name="Faturamento" fill="#0891b2" /></BarChart>
            </ResponsiveContainer>
          ) : <div className="p-6 text-center text-sm">Sem faturamento no período.</div>}
        </div>
        <div className="card">
          <h3 className="mb-2 text-sm font-semibold">Acompanhamento do limite configurado — {ano}</h3>
          <div className="space-y-3">
            {(lim.data ?? []).map((l) => (
              <div key={l.empresa_id}>
                <div className="mb-1 flex justify-between text-sm"><span>{nomeEmpresa(l.empresa_id)}</span><span><Badge valor={l.nivel} /> {l.percentual != null ? percentual(l.percentual) : ''}</span></div>
                <div className="h-2 rounded-full bg-muted"><div className={`h-2 rounded-full ${NIVEL_COR[l.nivel] ?? 'bg-muted'}`} style={{ width: `${Math.min(100, Number(l.percentual ?? 0))}%` }} /></div>
              </div>
            ))}
            {!(lim.data ?? []).length && <div className="text-sm text-sub">Sem empresas.</div>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Secao titulo={situacao ? `Cobranças: ${situacao.replace('_', ' ')}` : 'Próximos vencimentos'}>
          {listas.error ? <ErroBox erro={listas.error} /> : (
            <Tabela linhas={listas.data?.prox ?? []} chave={(c) => c.id} vazio="Nada a exibir."
              colunas={[{ titulo: 'Vencimento', render: (c) => data(c.vencimento) }, { titulo: 'Cliente', render: (c) => c.cliente_razao_social }, { titulo: 'Pendente', alinhar: 'right', render: (c) => moeda(c.valor_pendente) }]} />)}
        </Secao>
        <Secao titulo="Clientes com pagamentos atrasados">
          <Tabela linhas={listas.data?.atrasadas.slice(0, 8) ?? []} chave={(c) => c.id} vazio="Nenhum cliente em atraso."
            colunas={[{ titulo: 'Cliente', render: (c) => <><div>{c.cliente_razao_social}</div><div className="text-xs text-sub">{formatarCnpj(c.cliente_cnpj)}</div></> }, { titulo: 'Competência', render: (c) => competencia(c.competencia) }, { titulo: 'Venceu em', render: (c) => data(c.vencimento) }, { titulo: 'Pendente', alinhar: 'right', render: (c) => moeda(c.valor_pendente) }]} />
          {(listas.data?.atrasadas.length ?? 0) > 8 && <p className="mt-1 text-xs text-sub">+ {(listas.data?.atrasadas.length ?? 0) - 8} outras. Veja em Cobranças (filtro "Vencida").</p>}
        </Secao>
      </div>
      <p className="mt-4 text-xs text-sub">Faturamento é apurado por competência (ver definições ao passar o mouse em “?”). Pagamentos recebidos são indicadores de caixa e nunca somam ao faturamento.</p>
    </>
  )
}
