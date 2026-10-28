import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Legend, Line, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabase } from '@/lib/supabase'
import { ok, useClientes } from '@/lib/dados'
import { useEmpresa } from '@/lib/empresa-context'
import { useAuth } from '@/auth/AuthProvider'
import { TIPOS, filtrar, total, useFaturamentoAno, useLimites } from '@/lib/faturamento'
import { DEFINICOES } from '@/lib/definicoes'
import { lerMoeda, moeda, percentual } from '@/lib/money'
import { data, MESES } from '@/lib/datas'
import type { ParametroLimite, Receita } from '@/lib/types'
import { Badge, Campo, Carregando, ErroBox, PageHeader, Secao, StatCard, Tabela, mensagemErro, useToast } from '@/components/ui'
import { SeletorAno } from '@/components/FiltroPeriodo'

export default function LimiteMei() {
  const { empresas, empresaId, setEmpresaId } = useEmpresa()
  const { podeGerir } = useAuth()
  const hojeD = new Date()
  const [ano, setAno] = useState(hojeD.getFullYear())
  const [mostrarTodas, setMostrarTodas] = useState(false)
  const candidatas = empresas.filter((e) => mostrarTodas || e.regime_tributario === 'MEI')
  const alvo = empresaId && candidatas.some((e) => e.id === empresaId) ? empresaId : candidatas[0]?.id ?? null

  if (!empresas.length) return <><PageHeader titulo="Limite MEI" /><div className="card text-sm text-sub">Cadastre as empresas primeiro.</div></>
  return (
    <>
      <PageHeader titulo="Acompanhamento do limite" subtitulo="Ferramenta gerencial, não substitui a apuração tributária oficial. O limite é o valor que você configura." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SeletorAno valor={ano} onChange={setAno} />
        <select className="input w-auto" value={alvo ?? ''} onChange={(e) => setEmpresaId(e.target.value || null)} aria-label="Empresa">
          {candidatas.map((e) => <option key={e.id} value={e.id}>{e.nome_fantasia || e.razao_social}</option>)}
        </select>
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={mostrarTodas} onChange={(e) => setMostrarTodas(e.target.checked)} /> Incluir empresas que não são MEI</label>
      </div>
      {alvo ? <Painel empresaId={alvo} ano={ano} podeGerir={podeGerir} /> : (
        <div className="card text-sm text-sub">Nenhuma empresa está com regime “MEI”. Ajuste o regime em Empresas ou marque “Incluir empresas que não são MEI”.</div>
      )}
    </>
  )
}

function Painel({ empresaId, ano, podeGerir }: { empresaId: string; ano: number; podeGerir: boolean }) {
  const { nomeEmpresa } = useEmpresa()
  const clientes = useClientes()
  const sit = useLimites(empresaId, ano)
  const fat = useFaturamentoAno(empresaId, ano)
  const regs = useQuery({
    queryKey: ['limite-regs', empresaId, ano],
    queryFn: async () => ok(await supabase.from('v_receitas').select('*').eq('empresa_id', empresaId).gte('competencia', `${ano}-01-01`).lte('competencia', `${ano}-12-01`).order('data_ref').limit(1000)) as Receita[],
  })
  const param = useQuery({
    queryKey: ['param-limite', empresaId, ano],
    queryFn: async () => ok(await supabase.from('parametros_limite').select('*').eq('empresa_id', empresaId).eq('ano', ano).maybeSingle()) as ParametroLimite | null,
  })
  if (sit.isLoading || fat.isLoading || param.isLoading) return <Carregando />
  if (sit.error) return <ErroBox erro={sit.error} />
  const s = sit.data?.[0]
  if (!s) return null
  let acum = 0
  const evolucao = MESES.map((m, i) => {
    const v = total(filtrar(fat.data ?? [], { mes: i + 1 })).toNumber(); acum = Math.round((acum + v) * 100) / 100
    return { mes: m.slice(0, 3), mensal: v, acumulado: acum }
  })
  const nomeCli = (id: string | null) => (id ? clientes.data?.find((c) => c.id === id)?.razao_social : null) ?? '—'
  const tom = s.nivel === 'ok' ? 'ok' : s.nivel === 'atencao' ? 'warn' : s.nivel === 'sem_parametro' ? undefined : 'bad'

  return (
    <>
      <h2 className="mb-2 text-lg font-semibold">{nomeEmpresa(empresaId)} — {ano} <Badge valor={s.nivel} /></h2>
      {s.nivel === 'sem_parametro' && <div className="mb-3 rounded-md border border-warn p-3 text-sm text-warn">Nenhum limite configurado para {ano}. Informe os parâmetros abaixo; nenhum valor é presumido pelo sistema.</div>}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard titulo="Faturamento acumulado" valor={moeda(s.acumulado)} hint={DEFINICOES.limite} />
        <StatCard titulo="Limite configurado" valor={moeda(s.limite)} />
        <StatCard titulo="Saldo restante" valor={moeda(s.saldo)} tom={tom} />
        <StatCard titulo="Percentual utilizado" valor={percentual(s.percentual)} tom={tom} />
        <StatCard titulo="Projeção até dez (estimativa)" valor={moeda(s.projecao_anual)} detalhe="média mensal x 12" hint={DEFINICOES.projecao} tom={s.limite != null && s.projecao_anual > s.limite ? 'warn' : undefined} />
      </div>
      <div className="card mb-5 text-sub">
        <h3 className="mb-2 text-sm font-semibold text-fg">Evolução mensal e acumulado</h3>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={evolucao}><CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.2} /><XAxis dataKey="mes" tick={{ fill: 'currentColor', fontSize: 12 }} /><YAxis tick={{ fill: 'currentColor', fontSize: 12 }} width={70} tickFormatter={(v: number) => moeda(v).replace(',00', '')} />
            <Tooltip formatter={(v) => moeda(Number(v))} /><Legend />
            <Bar dataKey="mensal" name="No mês" fill="#2563eb" /><Line dataKey="acumulado" name="Acumulado" stroke="#7c3aed" strokeWidth={2} dot={false} />
            {s.limite != null && <ReferenceLine y={Number(s.limite)} stroke="#dc2626" strokeDasharray="6 4" label={{ value: 'Limite', fill: '#dc2626', fontSize: 12 }} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <ParametrosForm key={`${empresaId}-${ano}-${param.data?.id ?? 'novo'}`} empresaId={empresaId} ano={ano} atual={param.data ?? null} regimeEmpresa={s.regime} podeGerir={podeGerir} />
      <Secao titulo="Registros que compõem o acumulado">
        <Tabela linhas={regs.data ?? []} chave={(r) => r.chave}
          colunas={[{ titulo: 'Data', render: (r) => data(r.data_ref) }, { titulo: 'Tipo', render: (r) => TIPOS[r.tipo] }, { titulo: 'Cliente', render: (r) => nomeCli(r.cliente_id) }, { titulo: 'Descrição', render: (r) => r.descricao ?? '—' }, { titulo: 'Valor', alinhar: 'right', render: (r) => moeda(r.valor) }]} />
      </Secao>
    </>
  )
}

function ParametrosForm({ empresaId, ano, atual, regimeEmpresa, podeGerir }: { empresaId: string; ano: number; atual: ParametroLimite | null; regimeEmpresa: string | null; podeGerir: boolean }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [f, setF] = useState({
    limite: atual ? String(atual.limite).replace('.', ',') : '', atencao: String(atual?.alerta_atencao ?? 70), critico: String(atual?.alerta_critico ?? 90),
    regime: atual?.regime ?? regimeEmpresa ?? '', anterior: atual?.faturamento_anterior ? String(atual.faturamento_anterior).replace('.', ',') : '', criterio: atual?.criterio ?? 'Faturamento por competência: mensalidades, adicionais e vendas faturadas, líquido de cancelamentos.', observacoes: atual?.observacoes ?? '',
  })
  const [erro, setErro] = useState('')
  const salvar = useMutation({
    mutationFn: async () => {
      const limite = lerMoeda(f.limite)
      if (limite === null || limite <= 0) throw new Error('Informe o limite de referência.')
      const a = Number(f.atencao.replace(',', '.')); const c = Number(f.critico.replace(',', '.'))
      if (!(a > 0 && c > a && c <= 100)) throw new Error('Os percentuais devem ser crescentes (atenção < crítico ≤ 100).')
      const anterior = f.anterior.trim() ? lerMoeda(f.anterior) : 0
      if (anterior === null || anterior < 0) throw new Error('Informe um valor válido para o faturamento anterior ao sistema.')
      const r = await supabase.from('parametros_limite').upsert({ empresa_id: empresaId, ano, limite, faturamento_anterior: anterior, alerta_atencao: a, alerta_critico: c, regime: f.regime || null, criterio: f.criterio || null, observacoes: f.observacoes || null }, { onConflict: 'empresa_id,ano' })
      if (r.error) throw r.error
    },
    onSuccess: () => { qc.invalidateQueries(); toast('ok', 'Parâmetros salvos. Os lançamentos não foram alterados.') },
    onError: (e) => setErro(mensagemErro(e)),
  })
  return (
    <Secao titulo={`Parâmetros de ${ano}`}>
      <form className="card grid grid-cols-1 gap-3 sm:grid-cols-3" onSubmit={(e: FormEvent) => { e.preventDefault(); setErro(''); salvar.mutate() }}>
        <Campo rotulo="Limite de referência (R$) *" dica="Informe o valor vigente conforme sua orientação contábil."><input className="input" inputMode="decimal" value={f.limite} onChange={(e) => setF({ ...f, limite: e.target.value })} disabled={!podeGerir} /></Campo>
        <Campo rotulo="Alerta de atenção (%)" dica="Sugestão inicial: 70"><input className="input" inputMode="decimal" value={f.atencao} onChange={(e) => setF({ ...f, atencao: e.target.value })} disabled={!podeGerir} /></Campo>
        <Campo rotulo="Alerta crítico (%)" dica="Sugestão inicial: 90"><input className="input" inputMode="decimal" value={f.critico} onChange={(e) => setF({ ...f, critico: e.target.value })} disabled={!podeGerir} /></Campo>
        <Campo rotulo="Regime (referência)"><input className="input" value={f.regime} onChange={(e) => setF({ ...f, regime: e.target.value })} disabled={!podeGerir} /></Campo>
        <Campo rotulo={`Faturamento de ${ano} anterior ao sistema (R$)`} dica="Opcional. O que já foi faturado no ano antes de usar o sistema; soma-se ao acumulado do limite (não entra no dashboard)."><input className="input" inputMode="decimal" placeholder="0,00" value={f.anterior} onChange={(e) => setF({ ...f, anterior: e.target.value })} disabled={!podeGerir} /></Campo>
        <Campo rotulo="Critério de apuração" className="sm:col-span-2"><input className="input" value={f.criterio} onChange={(e) => setF({ ...f, criterio: e.target.value })} disabled={!podeGerir} /></Campo>
        <Campo rotulo="Observações" className="sm:col-span-3"><textarea className="input" rows={2} value={f.observacoes} onChange={(e) => setF({ ...f, observacoes: e.target.value })} disabled={!podeGerir} /></Campo>
        {erro && <p role="alert" className="text-sm text-bad sm:col-span-3">{erro}</p>}
        {podeGerir ? <div className="sm:col-span-3"><button className="btn-primary" disabled={salvar.isPending}>Salvar parâmetros</button></div> : <p className="text-xs text-sub sm:col-span-3">Somente proprietário ou gestor da empresa altera os parâmetros.</p>}
      </form>
    </Secao>
  )
}
