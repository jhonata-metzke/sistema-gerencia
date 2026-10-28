import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { intervaloCompetencia, ok } from '@/lib/dados'
import { useEmpresa } from '@/lib/empresa-context'
import { useAuth } from '@/auth/AuthProvider'
import { formatarCnpj, normalizarCnpj } from '@/lib/cnpj'
import { lerMoeda, moeda, somar } from '@/lib/money'
import { competencia, data, hoje, primeiroDia } from '@/lib/datas'
import type { CobrancaView, Pagamento, StatusExibicao } from '@/lib/types'
import { Badge, Busca, Campo, Carregando, Confirmar, Drawer, ErroBox, Modal, PageHeader, Secao, StatCard, Tabela, mensagemErro, useToast } from '@/components/ui'
import { SeletorAno, SeletorMes } from '@/components/FiltroPeriodo'

const STATUS: Array<[StatusExibicao | '', string]> = [['', 'Todas as situações'], ['prevista', 'Prevista'], ['pendente', 'Pendente'], ['parcialmente_paga', 'Parcialmente paga'], ['paga', 'Paga'], ['vencida', 'Vencida'], ['cancelada', 'Cancelada']]

export default function Cobrancas() {
  const { empresaId, empresas, nomeEmpresa } = useEmpresa()
  const { podeEditar } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const hojeD = new Date()
  const [ano, setAno] = useState(hojeD.getFullYear())
  const [mes, setMes] = useState(hojeD.getMonth() + 1)
  const [status, setStatus] = useState<StatusExibicao | ''>('')
  const [busca, setBusca] = useState('')
  const [venc, setVenc] = useState({ de: '', ate: '' })
  const [pagar, setPagar] = useState<CobrancaView | null>(null)
  const [cancelar, setCancelar] = useState<CobrancaView | null>(null)
  const [aberta, setAberta] = useState<CobrancaView | null>(null)

  const q = useQuery({
    queryKey: ['cobrancas', empresaId, ano, mes],
    queryFn: async () => {
      const [ini, fim] = intervaloCompetencia(ano, mes)
      let r = supabase.from('v_cobrancas').select('*').gte('competencia', ini).lte('competencia', fim).order('vencimento').order('cliente_razao_social')
      if (empresaId) r = r.eq('empresa_id', empresaId)
      return ok(await r) as CobrancaView[]
    },
  })

  const linhas = useMemo(() => {
    const t = busca.trim().toLowerCase(); const n = normalizarCnpj(busca).toLowerCase()
    return (q.data ?? []).filter((c) =>
      (!status || c.status_exibicao === status || (status === 'vencida' && c.vencida)) &&
      (!venc.de || c.vencimento >= venc.de) && (!venc.ate || c.vencimento <= venc.ate) &&
      (!t || c.cliente_razao_social.toLowerCase().includes(t) || (n && c.cliente_cnpj.toLowerCase().includes(n))))
  }, [q.data, status, busca, venc])

  const nao = (c: CobrancaView) => c.status_exibicao !== 'cancelada'
  const tot = {
    previsto: somar(linhas.filter((c) => c.status_exibicao === 'prevista').map((c) => c.valor_total)),
    faturado: somar(linhas.filter((c) => nao(c) && c.faturada_em).map((c) => c.valor_total)),
    recebido: somar(linhas.filter(nao).map((c) => c.valor_pago)),
    pendente: somar(linhas.filter((c) => nao(c) && c.faturada_em).map((c) => c.valor_pendente)),
  }

  const gerar = useMutation({
    mutationFn: async () => {
      const alvo = empresaId ? [empresaId] : empresas.filter((e) => e.situacao === 'ativa').map((e) => e.id)
      let criadas = 0, existentes = 0, ad = 0
      for (const id of alvo) {
        const r = await supabase.rpc('gerar_cobrancas', { p_empresa: id, p_competencia: primeiroDia(ano, mes) })
        if (r.error) throw r.error
        criadas += r.data.criadas; existentes += r.data.ja_existentes; ad += r.data.adicionais_vinculados
      }
      return { criadas, existentes, ad }
    },
    onSuccess: (r) => { qc.invalidateQueries(); toast('ok', `${r.criadas} cobrança(s) criada(s); ${r.existentes} já existiam; ${r.ad} adicional(is) vinculado(s).`) },
    onError: (e) => toast('erro', mensagemErro(e)),
  })

  const cancelarM = useMutation({
    mutationFn: async (c: CobrancaView) => { const r = await supabase.rpc('cancelar_cobranca', { p_id: c.id, p_motivo: null }); if (r.error) throw r.error },
    onSuccess: () => { qc.invalidateQueries(); toast('ok', 'Cobrança cancelada.'); setCancelar(null) },
    onError: (e) => { toast('erro', mensagemErro(e)); setCancelar(null) },
  })

  return (
    <>
      <PageHeader titulo="Cobranças e pagamentos" subtitulo="Geradas a partir dos contratos e adicionais. Pagamentos são registrados manualmente."
        acoes={(
          <div className="no-print flex gap-2">
            <button className="btn-ghost" onClick={() => window.print()}>Imprimir / PDF</button>
            {podeEditar && (
              <button className="btn-primary" disabled={mes === 0 || gerar.isPending} onClick={() => gerar.mutate()} title={mes === 0 ? 'Selecione um mês para gerar' : undefined}>
                {gerar.isPending ? 'Gerando…' : 'Gerar cobranças da competência'}
              </button>)}
          </div>)} />
      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        <SeletorAno valor={ano} onChange={setAno} /><SeletorMes valor={mes} onChange={setMes} todos />
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value as StatusExibicao | '')} aria-label="Situação">
          {STATUS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
        </select>
        <Busca valor={busca} onChange={setBusca} placeholder="Cliente ou CNPJ" />
        <label className="flex items-center gap-1 text-xs text-sub">Vencimento de <input className="input w-auto" type="date" value={venc.de} onChange={(e) => setVenc({ ...venc, de: e.target.value })} /></label>
        <label className="flex items-center gap-1 text-xs text-sub">até <input className="input w-auto" type="date" value={venc.ate} onChange={(e) => setVenc({ ...venc, ate: e.target.value })} /></label>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard titulo="Previsto" valor={moeda(tot.previsto)} detalhe="competências ainda não faturadas" />
        <StatCard titulo="Faturado" valor={moeda(tot.faturado)} />
        <StatCard titulo="Recebido" valor={moeda(tot.recebido)} tom="ok" />
        <StatCard titulo="Pendente" valor={moeda(tot.pendente)} tom={tot.pendente.gt(0) ? 'warn' : undefined} />
      </div>
      {q.isLoading ? <Carregando /> : q.error ? <ErroBox erro={q.error} /> : (
        <Tabela linhas={linhas} chave={(c) => c.id} aoClicar={setAberta}
          colunas={[
            { titulo: 'Cliente', render: (c) => <><div>{c.cliente_razao_social}</div><div className="text-xs text-sub">{formatarCnpj(c.cliente_cnpj)}</div></> },
            ...(empresaId ? [] : [{ titulo: 'Empresa', render: (c: CobrancaView) => nomeEmpresa(c.empresa_id) }]),
            { titulo: 'Competência', render: (c) => competencia(c.competencia) },
            { titulo: 'Vencimento', render: (c) => data(c.vencimento) },
            { titulo: 'Total', alinhar: 'right', render: (c) => moeda(c.valor_total) },
            { titulo: 'Pago', alinhar: 'right', render: (c) => moeda(c.valor_pago) },
            { titulo: 'Pendente', alinhar: 'right', render: (c) => moeda(c.valor_pendente) },
            { titulo: 'Situação', render: (c) => <span className="flex gap-1"><Badge valor={c.status_exibicao} />{c.vencida && c.status_exibicao !== 'vencida' && <Badge valor="vencida" />}</span> },
            ...(podeEditar ? [{ titulo: '', render: (c: CobrancaView) => (
              <span className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                {c.status_exibicao !== 'cancelada' && c.status !== 'paga' && <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setPagar(c)}>Pagamento</button>}
                {c.status_exibicao !== 'cancelada' && Number(c.valor_pago) === 0 && <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setCancelar(c)}>Cancelar</button>}
              </span>) }] : []),
          ]} />
      )}
      {pagar && <PagamentoForm cobranca={pagar} onClose={() => setPagar(null)} />}
      {cancelar && <Confirmar titulo="Cancelar cobrança" perigo rotulo="Cancelar cobrança" texto={`Cancelar a cobrança de ${cancelar.cliente_razao_social} (${competencia(cancelar.competencia)}, ${moeda(cancelar.valor_total)})? Ela deixa de compor o faturamento e passa a aparecer em cancelamentos.`} onConfirm={() => cancelarM.mutateAsync(cancelar)} onClose={() => setCancelar(null)} />}
      {aberta && <CobrancaDetalhe cobranca={aberta} onClose={() => setAberta(null)} />}
    </>
  )
}

function PagamentoForm({ cobranca, onClose }: { cobranca: CobrancaView; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [valor, setValor] = useState(String(cobranca.valor_pendente).replace('.', ','))
  const [dt, setDt] = useState(hoje())
  const [forma, setForma] = useState('')
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState('')
  const salvar = useMutation({
    mutationFn: async () => {
      const v = lerMoeda(valor)
      if (v === null || v <= 0) throw new Error('Informe um valor maior que zero.')
      const r = await supabase.from('pagamentos').insert({ cobranca_id: cobranca.id, valor: v, data_recebimento: dt, forma: forma || null, observacao: obs || null })
      if (r.error) throw r.error
    },
    onSuccess: () => { qc.invalidateQueries(); toast('ok', 'Pagamento registrado.'); onClose() },
    onError: (e) => setErro(mensagemErro(e)),
  })
  return (
    <Modal titulo="Registrar pagamento" onClose={onClose}>
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); setErro(''); salvar.mutate() }} className="space-y-3">
        <p className="text-sm text-sub">{cobranca.cliente_razao_social} — competência {competencia(cobranca.competencia)}. Total {moeda(cobranca.valor_total)}, saldo {moeda(cobranca.valor_pendente)}. Valor menor que o saldo registra pagamento parcial.</p>
        <Campo rotulo="Valor recebido (R$) *"><input className="input" required inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} /></Campo>
        <Campo rotulo="Data do recebimento *"><input className="input" type="date" required value={dt} onChange={(e) => setDt(e.target.value)} /></Campo>
        <Campo rotulo="Forma de pagamento"><input className="input" value={forma} onChange={(e) => setForma(e.target.value)} placeholder="PIX, boleto, dinheiro…" /></Campo>
        <Campo rotulo="Observações"><input className="input" value={obs} onChange={(e) => setObs(e.target.value)} /></Campo>
        {erro && <p role="alert" className="text-sm text-bad">{erro}</p>}
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={salvar.isPending}>Registrar</button></div>
      </form>
    </Modal>
  )
}

function CobrancaDetalhe({ cobranca, onClose }: { cobranca: CobrancaView; onClose: () => void }) {
  const { podeGerir } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [obs, setObs] = useState(cobranca.observacoes ?? '')
  const pag = useQuery({ queryKey: ['pagamentos', cobranca.id], queryFn: async () => ok(await supabase.from('pagamentos').select('*').eq('cobranca_id', cobranca.id).order('data_recebimento')) as Pagamento[] })
  const adic = useQuery({ queryKey: ['cob-adic', cobranca.id], queryFn: async () => ok(await supabase.from('cobranca_adicionais').select('valor, adicionais(descricao)').eq('cobranca_id', cobranca.id)) as unknown as Array<{ valor: number; adicionais: { descricao: string } | null }> })
  const salvarObs = useMutation({
    mutationFn: async () => { const r = await supabase.from('cobrancas').update({ observacoes: obs || null }).eq('id', cobranca.id); if (r.error) throw r.error },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cobrancas'] }); toast('ok', 'Observação salva.') },
    onError: (e) => toast('erro', mensagemErro(e)),
  })
  const estornar = useMutation({
    mutationFn: async (id: string) => { const r = await supabase.from('pagamentos').delete().eq('id', id); if (r.error) throw r.error },
    onSuccess: () => { qc.invalidateQueries(); toast('ok', 'Pagamento removido.') },
    onError: (e) => toast('erro', mensagemErro(e)),
  })
  return (
    <Drawer titulo={`${cobranca.cliente_razao_social} — ${competencia(cobranca.competencia)}`} onClose={onClose}>
      <Secao titulo="Valores">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard titulo="Base" valor={moeda(cobranca.valor_base)} /><StatCard titulo="Adicionais" valor={moeda(cobranca.valor_adicionais)} />
          <StatCard titulo="Total" valor={moeda(cobranca.valor_total)} /><StatCard titulo="Pendente" valor={moeda(cobranca.valor_pendente)} />
        </div>
        <p className="mt-2 text-xs text-sub">Valores congelados no momento da geração. Situação: <Badge valor={cobranca.status_exibicao} /> — vencimento {data(cobranca.vencimento)}.</p>
      </Secao>
      {(adic.data?.length ?? 0) > 0 && (
        <Secao titulo="Adicionais incluídos">
          <Tabela linhas={adic.data ?? []} chave={(a) => a.adicionais?.descricao + String(a.valor)} colunas={[{ titulo: 'Descrição', render: (a) => a.adicionais?.descricao ?? '' }, { titulo: 'Valor', alinhar: 'right', render: (a) => moeda(a.valor) }]} />
        </Secao>
      )}
      <Secao titulo="Histórico de pagamentos">
        <Tabela linhas={pag.data ?? []} chave={(p) => p.id} vazio="Nenhum pagamento registrado."
          colunas={[{ titulo: 'Data', render: (p) => data(p.data_recebimento) }, { titulo: 'Valor', alinhar: 'right', render: (p) => moeda(p.valor) }, { titulo: 'Forma', render: (p) => p.forma ?? '—' },
            ...(podeGerir ? [{ titulo: '', render: (p: Pagamento) => <button className="btn-ghost px-2 py-1 text-xs" onClick={() => confirm('Remover este pagamento?') && estornar.mutate(p.id)}>Remover</button> }] : [])]} />
      </Secao>
      <Secao titulo="Observações">
        <textarea className="input" rows={3} value={obs} onChange={(e) => setObs(e.target.value)} />
        <button className="btn-ghost mt-2" onClick={() => salvarObs.mutate()}>Salvar observação</button>
      </Secao>
    </Drawer>
  )
}
