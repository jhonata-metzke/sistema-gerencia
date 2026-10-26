import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { ok, useClientes, useSistemas } from '@/lib/dados'
import { useEmpresa } from '@/lib/empresa-context'
import { useAuth } from '@/auth/AuthProvider'
import { formatarCnpj, normalizarCnpj } from '@/lib/cnpj'
import { lerMoeda, moeda } from '@/lib/money'
import { competencia, data, hoje, MESES } from '@/lib/datas'
import type { Adicional, Auditoria, CobrancaView, ContratoLista, ContratoVersao } from '@/lib/types'
import { Badge, Busca, Campo, Carregando, Detalhe, Drawer, ErroBox, Modal, PageHeader, Secao, Tabela, mensagemErro, useToast } from '@/components/ui'

const ROTULO_PER = { mensal: 'Mensal', anual: 'Anual', unica: 'Única', intervalo: 'A cada N meses' } as const

export default function Mensalidades() {
  const { empresaId } = useEmpresa()
  const { podeEditar } = useAuth()
  const [busca, setBusca] = useState('')
  const [situacao, setSituacao] = useState('ativo')
  const [aberto, setAberto] = useState<string | null>(null)
  const [novo, setNovo] = useState(false)

  const q = useQuery({
    queryKey: ['contratos', empresaId],
    queryFn: async () => {
      let r = supabase.from('v_contratos_lista').select('*').order('cliente_razao_social')
      if (empresaId) r = r.eq('empresa_id', empresaId)
      return ok(await r) as ContratoLista[]
    },
  })

  const linhas = useMemo(() => {
    const t = busca.trim().toLowerCase()
    const n = normalizarCnpj(busca).toLowerCase()
    return (q.data ?? []).filter((c) =>
      (situacao === 'todos' || c.situacao === situacao) &&
      (!t || c.cliente_razao_social.toLowerCase().includes(t) || c.descricao.toLowerCase().includes(t) || (n && c.cliente_cnpj.toLowerCase().includes(n))))
  }, [q.data, busca, situacao])

  return (
    <>
      <PageHeader titulo="Mensalidades" subtitulo="Clique em um contrato para ver todos os detalhes."
        acoes={podeEditar && <button className="btn-primary" onClick={() => setNovo(true)}>Novo contrato</button>} />
      <div className="mb-3 flex flex-wrap gap-2">
        <Busca valor={busca} onChange={setBusca} placeholder="Cliente, CNPJ ou descrição" />
        <select className="input w-auto" value={situacao} onChange={(e) => setSituacao(e.target.value)} aria-label="Situação do contrato">
          <option value="ativo">Ativos</option><option value="suspenso">Suspensos</option><option value="encerrado">Encerrados</option><option value="todos">Todos</option>
        </select>
      </div>
      {q.isLoading ? <Carregando /> : q.error ? <ErroBox erro={q.error} /> : (
        <Tabela linhas={linhas} chave={(c) => c.id} aoClicar={(c) => setAberto(c.id)}
          colunas={[
            { titulo: 'Razão social', render: (c) => c.cliente_razao_social },
            { titulo: 'CNPJ', render: (c) => formatarCnpj(c.cliente_cnpj) },
            { titulo: 'Valor', alinhar: 'right', render: (c) => moeda(c.valor_atual) },
            { titulo: 'Descrição', render: (c) => c.descricao },
          ]} />
      )}
      {aberto && <ContratoDetalhe id={aberto} onClose={() => setAberto(null)} />}
      {novo && <ContratoForm onClose={() => setNovo(false)} />}
    </>
  )
}

function ContratoDetalhe({ id, onClose }: { id: string; onClose: () => void }) {
  const { nomeEmpresa } = useEmpresa()
  const { podeEditar, isOwner } = useAuth()
  const [editar, setEditar] = useState(false)
  const [alterarValor, setAlterarValor] = useState(false)
  const c = useQuery({ queryKey: ['contrato', id], queryFn: async () => ok(await supabase.from('v_contratos_lista').select('*').eq('id', id).single()) as ContratoLista })
  const versoes = useQuery({ queryKey: ['versoes', id], queryFn: async () => ok(await supabase.from('contrato_versoes').select('*').eq('contrato_id', id).order('vigencia_inicio', { ascending: false })) as ContratoVersao[] })
  const cobrancas = useQuery({ queryKey: ['contrato-cobrancas', id], queryFn: async () => ok(await supabase.from('v_cobrancas').select('*').eq('contrato_id', id).order('competencia', { ascending: false })) as CobrancaView[] })
  const adicionais = useQuery({ queryKey: ['contrato-adicionais', id], queryFn: async () => ok(await supabase.from('adicionais').select('*').eq('contrato_id', id).order('competencia', { ascending: false })) as Adicional[] })
  const hist = useQuery({ enabled: isOwner, queryKey: ['contrato-hist', id], queryFn: async () => ok(await supabase.from('auditoria').select('*').in('tabela', ['contratos', 'contrato_versoes']).or(`registro_id.eq.${id},depois->>contrato_id.eq.${id}`).order('em', { ascending: false })) as Auditoria[] })

  if (c.isLoading) return <Drawer titulo="Contrato" onClose={onClose}><Carregando /></Drawer>
  if (c.error || !c.data) return <Drawer titulo="Contrato" onClose={onClose}><ErroBox erro={c.error} /></Drawer>
  const k = c.data
  const adicionaisAtivos = (adicionais.data ?? []).filter((a) => a.situacao === 'ativo')

  return (
    <Drawer titulo={`${k.cliente_razao_social} — ${k.descricao}`} onClose={onClose}>
      <Secao titulo="Contrato" acoes={podeEditar && (
        <div className="flex gap-2"><button className="btn-ghost" onClick={() => setAlterarValor(true)}>Alterar valor</button><button className="btn-ghost" onClick={() => setEditar(true)}>Editar</button></div>)}>
        <dl className="card grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Detalhe rotulo="Razão social">{k.cliente_razao_social}</Detalhe>
          <Detalhe rotulo="CNPJ do cliente">{formatarCnpj(k.cliente_cnpj)}</Detalhe>
          <Detalhe rotulo="Empresa responsável pela cobrança">{nomeEmpresa(k.empresa_id)}</Detalhe>
          <Detalhe rotulo="Descrição do serviço">{k.descricao}</Detalhe>
          <Detalhe rotulo="Sistema utilizado">{k.sistema_nome}</Detalhe>
          <Detalhe rotulo="Valor base vigente">{moeda(k.valor_atual)}</Detalhe>
          <Detalhe rotulo="Periodicidade">{ROTULO_PER[k.periodicidade]}{k.periodicidade === 'intervalo' && ` (${k.intervalo_meses} meses)`}{k.periodicidade === 'anual' && k.mes_cobranca_anual ? ` — mês ${MESES[k.mes_cobranca_anual - 1]}` : ''}</Detalhe>
          <Detalhe rotulo="Dia de vencimento">{k.dia_vencimento}</Detalhe>
          <Detalhe rotulo="Emite nota fiscal">{k.emite_nf ? 'Sim' : 'Não'}</Detalhe>
          <Detalhe rotulo="Início do contrato">{data(k.inicio_em)}</Detalhe>
          <Detalhe rotulo="Encerramento">{data(k.fim_em)}</Detalhe>
          <Detalhe rotulo="Situação"><Badge valor={k.situacao} /></Detalhe>
          <Detalhe rotulo="Observações">{k.observacoes}</Detalhe>
        </dl>
      </Secao>
      <Secao titulo="Adicionais e outros valores">
        <Tabela linhas={adicionaisAtivos} chave={(a) => a.id} vazio="Nenhum adicional ativo vinculado."
          colunas={[{ titulo: 'Descrição', render: (a) => a.descricao }, { titulo: 'Valor', alinhar: 'right', render: (a) => moeda(a.valor) }, { titulo: 'Periodicidade', render: (a) => ROTULO_PER[a.periodicidade] }]} />
      </Secao>
      <Secao titulo="Histórico de valores (vigência)">
        <Tabela linhas={versoes.data ?? []} chave={(v) => v.id}
          colunas={[{ titulo: 'Vigente desde', render: (v) => data(v.vigencia_inicio) }, { titulo: 'Valor base', alinhar: 'right', render: (v) => moeda(v.valor_base) }, { titulo: 'Motivo', render: (v) => v.motivo ?? '—' }]} />
        <p className="mt-1 text-xs text-sub">Alterações valem a partir da vigência; cobranças já geradas mantêm o valor da época.</p>
      </Secao>
      <Secao titulo="Histórico de cobranças">
        <Tabela linhas={cobrancas.data ?? []} chave={(x) => x.id} vazio="Nenhuma cobrança gerada."
          colunas={[{ titulo: 'Competência', render: (x) => competencia(x.competencia) }, { titulo: 'Vencimento', render: (x) => data(x.vencimento) },
            { titulo: 'Base', alinhar: 'right', render: (x) => moeda(x.valor_base) }, { titulo: 'Adicionais', alinhar: 'right', render: (x) => moeda(x.valor_adicionais) },
            { titulo: 'Total', alinhar: 'right', render: (x) => moeda(x.valor_total) }, { titulo: 'Situação', render: (x) => <Badge valor={x.status_exibicao} /> }]} />
      </Secao>
      {isOwner && (
        <Secao titulo="Histórico de alterações">
          <Tabela linhas={hist.data ?? []} chave={(h) => String(h.id)} vazio="Sem alterações registradas."
            colunas={[{ titulo: 'Quando', render: (h) => new Date(h.em).toLocaleString('pt-BR') }, { titulo: 'Registro', render: (h) => h.tabela === 'contratos' ? 'Contrato' : 'Valor' }, { titulo: 'Ação', render: (h) => h.acao }]} />
        </Secao>
      )}
      {editar && <ContratoForm inicial={k} onClose={() => setEditar(false)} />}
      {alterarValor && <AlterarValor contrato={k} onClose={() => setAlterarValor(false)} />}
    </Drawer>
  )
}

function AlterarValor({ contrato, onClose }: { contrato: ContratoLista; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [valor, setValor] = useState('')
  const [vigencia, setVigencia] = useState(hoje())
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')
  const salvar = useMutation({
    mutationFn: async () => {
      const v = lerMoeda(valor)
      if (v === null || v < 0) throw new Error('Informe um valor válido.')
      const r = await supabase.rpc('alterar_valor_contrato', { p_contrato: contrato.id, p_valor: v, p_vigencia: vigencia, p_motivo: motivo || null })
      if (r.error) throw r.error
    },
    onSuccess: () => { qc.invalidateQueries(); toast('ok', 'Valor alterado a partir da vigência informada.'); onClose() },
    onError: (e) => setErro(mensagemErro(e).includes('duplicate') ? 'Já existe uma alteração com esta data de vigência.' : mensagemErro(e)),
  })
  return (
    <Modal titulo="Alterar valor do contrato" onClose={onClose}>
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); setErro(''); salvar.mutate() }} className="space-y-3">
        <p className="text-sm text-sub">Valor atual: {moeda(contrato.valor_atual)}. Cobranças já geradas não serão alteradas.</p>
        <Campo rotulo="Novo valor base (R$) *"><input className="input" required inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" /></Campo>
        <Campo rotulo="Vigente a partir de *"><input className="input" type="date" required value={vigencia} onChange={(e) => setVigencia(e.target.value)} /></Campo>
        <Campo rotulo="Motivo"><input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: reajuste anual" /></Campo>
        {erro && <p role="alert" className="text-sm text-bad">{erro}</p>}
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={salvar.isPending}>Salvar</button></div>
      </form>
    </Modal>
  )
}

function ContratoForm({ inicial, onClose }: { inicial?: ContratoLista; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const { empresas, empresaId } = useEmpresa()
  const clientes = useClientes()
  const sistemas = useSistemas()
  const [f, setF] = useState({
    empresa_id: inicial?.empresa_id ?? empresaId ?? empresas[0]?.id ?? '', cliente_id: inicial?.cliente_id ?? '', descricao: inicial?.descricao ?? '',
    sistema_id: inicial?.sistema_id ?? '', valor: '', periodicidade: inicial?.periodicidade ?? 'mensal', intervalo_meses: String(inicial?.intervalo_meses ?? 3),
    dia_vencimento: String(inicial?.dia_vencimento ?? 10), mes_cobranca_anual: String(inicial?.mes_cobranca_anual ?? ''), emite_nf: inicial?.emite_nf ?? false,
    inicio_em: inicial?.inicio_em ?? hoje(), fim_em: inicial?.fim_em ?? '', situacao: inicial?.situacao ?? 'ativo', observacoes: inicial?.observacoes ?? '',
  })
  const [erro, setErro] = useState('')
  const salvar = useMutation({
    mutationFn: async () => {
      const dados = {
        empresa_id: f.empresa_id, cliente_id: f.cliente_id, descricao: f.descricao, sistema_id: f.sistema_id || null, periodicidade: f.periodicidade,
        intervalo_meses: f.periodicidade === 'intervalo' ? Number(f.intervalo_meses) : null, dia_vencimento: Number(f.dia_vencimento),
        mes_cobranca_anual: f.periodicidade === 'anual' && f.mes_cobranca_anual ? Number(f.mes_cobranca_anual) : null,
        emite_nf: f.emite_nf, inicio_em: f.inicio_em, fim_em: f.fim_em || null, situacao: f.situacao, observacoes: f.observacoes || null,
      }
      if (inicial) {
        const r = await supabase.from('contratos').update(dados).eq('id', inicial.id)
        if (r.error) throw r.error
        return
      }
      const v = lerMoeda(f.valor)
      if (v === null || v < 0) throw new Error('Informe o valor base da mensalidade.')
      const r = await supabase.rpc('criar_contrato', { p_dados: dados, p_valor: v })
      if (r.error) throw r.error
    },
    onSuccess: () => { qc.invalidateQueries(); toast('ok', 'Contrato salvo.'); onClose() },
    onError: (e) => setErro(mensagemErro(e)),
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  return (
    <Modal titulo={inicial ? 'Editar contrato' : 'Novo contrato'} onClose={onClose} largo>
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); setErro(''); salvar.mutate() }} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo rotulo="Empresa responsável *">
          <select className="input" required value={f.empresa_id} onChange={set('empresa_id')} disabled={Boolean(inicial)}>
            {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome_fantasia || e.razao_social}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Cliente *">
          <select className="input" required value={f.cliente_id} onChange={set('cliente_id')} disabled={Boolean(inicial)}>
            <option value="">Selecione…</option>
            {(clientes.data ?? []).filter((c) => c.ativo || c.id === f.cliente_id).map((c) => <option key={c.id} value={c.id}>{c.razao_social} — {formatarCnpj(c.cnpj)}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Descrição do serviço *" className="sm:col-span-2"><input className="input" required value={f.descricao} onChange={set('descricao')} placeholder="Ex.: Sistema de ponto" /></Campo>
        <Campo rotulo="Sistema utilizado">
          <select className="input" value={f.sistema_id} onChange={set('sistema_id')}><option value="">—</option>{(sistemas.data ?? []).filter((s) => s.ativo).map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select>
        </Campo>
        {!inicial && <Campo rotulo="Valor base (R$) *"><input className="input" required inputMode="decimal" value={f.valor} onChange={set('valor')} placeholder="0,00" /></Campo>}
        <Campo rotulo="Periodicidade">
          <select className="input" value={f.periodicidade} onChange={set('periodicidade')}>{Object.entries(ROTULO_PER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Campo>
        {f.periodicidade === 'intervalo' && <Campo rotulo="A cada quantos meses"><input className="input" type="number" min={1} value={f.intervalo_meses} onChange={set('intervalo_meses')} /></Campo>}
        {f.periodicidade === 'anual' && (
          <Campo rotulo="Mês da cobrança anual" dica="Vazio = mês de início do contrato">
            <select className="input" value={f.mes_cobranca_anual} onChange={set('mes_cobranca_anual')}><option value="">Mês de início</option>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
          </Campo>
        )}
        <Campo rotulo="Dia de vencimento *" dica="Em meses mais curtos vence no último dia."><input className="input" type="number" min={1} max={31} required value={f.dia_vencimento} onChange={set('dia_vencimento')} /></Campo>
        <Campo rotulo="Início *"><input className="input" type="date" required value={f.inicio_em} onChange={set('inicio_em')} /></Campo>
        <Campo rotulo="Encerramento"><input className="input" type="date" value={f.fim_em} onChange={set('fim_em')} /></Campo>
        <Campo rotulo="Situação">
          <select className="input" value={f.situacao} onChange={set('situacao')}><option value="ativo">Ativo</option><option value="suspenso">Suspenso</option><option value="encerrado">Encerrado</option></select>
        </Campo>
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={f.emite_nf} onChange={(e) => setF({ ...f, emite_nf: e.target.checked })} /> Precisa de emissão de nota fiscal</label>
        <Campo rotulo="Observações" className="sm:col-span-2"><textarea className="input" rows={2} value={f.observacoes} onChange={set('observacoes')} /></Campo>
        {erro && <p role="alert" className="text-sm text-bad sm:col-span-2">{erro}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={salvar.isPending}>Salvar</button></div>
      </form>
    </Modal>
  )
}
