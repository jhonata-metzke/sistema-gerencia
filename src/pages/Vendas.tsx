import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { ok, useCategorias, useClientes } from '@/lib/dados'
import { useEmpresa } from '@/lib/empresa-context'
import { useAuth } from '@/auth/AuthProvider'
import { formatarCnpj } from '@/lib/cnpj'
import { dec, lerMoeda, moeda, somar } from '@/lib/money'
import { data, hoje } from '@/lib/datas'
import type { Venda, VendaAjuste, VendaItem } from '@/lib/types'
import { Badge, Busca, Campo, Carregando, Confirmar, Drawer, ErroBox, Modal, PageHeader, Secao, Tabela, mensagemErro, useToast } from '@/components/ui'

type VendaComTotal = Venda & { venda_itens: Array<{ total: number }> }
const STATUS = ['registrada', 'faturada', 'recebida', 'cancelada'] as const

export default function Vendas() {
  const { empresaId, nomeEmpresa } = useEmpresa()
  const { podeEditar } = useAuth()
  const clientes = useClientes()
  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState('')
  const [novo, setNovo] = useState(false)
  const [aberta, setAberta] = useState<string | null>(null)
  const q = useQuery({
    queryKey: ['vendas', empresaId],
    queryFn: async () => {
      let r = supabase.from('vendas').select('*, venda_itens(total)').order('data_operacao', { ascending: false })
      if (empresaId) r = r.eq('empresa_id', empresaId)
      return ok(await r) as VendaComTotal[]
    },
  })
  const nomeComprador = (v: Venda) => (v.cliente_id ? clientes.data?.find((c) => c.id === v.cliente_id)?.razao_social : v.comprador_nome) ?? '—'
  const linhas = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return (q.data ?? []).filter((v) => (!status || v.status === status) && (!t || nomeComprador(v).toLowerCase().includes(t) || (v.documento ?? '').toLowerCase().includes(t)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data, busca, status, clientes.data])

  return (
    <>
      <PageHeader titulo="Vendas de mercadorias" subtitulo="Controle gerencial. Sem estoque nem emissão fiscal nesta versão."
        acoes={podeEditar && <button className="btn-primary" onClick={() => setNovo(true)}>Nova venda</button>} />
      <div className="mb-3 flex flex-wrap gap-2">
        <Busca valor={busca} onChange={setBusca} placeholder="Comprador ou documento" />
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Situação">
          <option value="">Todas as situações</option>{STATUS.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
      </div>
      {q.isLoading ? <Carregando /> : q.error ? <ErroBox erro={q.error} /> : (
        <Tabela linhas={linhas} chave={(v) => v.id} aoClicar={(v) => setAberta(v.id)}
          colunas={[
            { titulo: 'Data', render: (v) => data(v.data_operacao) },
            { titulo: 'Comprador', render: (v) => nomeComprador(v) },
            ...(empresaId ? [] : [{ titulo: 'Empresa', render: (v: VendaComTotal) => nomeEmpresa(v.empresa_id) }]),
            { titulo: 'Documento', render: (v) => v.documento ?? '—' },
            { titulo: 'Total', alinhar: 'right', render: (v) => moeda(somar(v.venda_itens.map((i) => i.total))) },
            { titulo: 'Situação', render: (v) => <Badge valor={v.status} /> },
          ]} />
      )}
      {novo && <VendaForm onClose={() => setNovo(false)} />}
      {aberta && <VendaDetalhe id={aberta} onClose={() => setAberta(null)} />}
    </>
  )
}

interface ItemForm { descricao: string; quantidade: string; valor_unitario: string; desconto: string }
const itemVazio = (): ItemForm => ({ descricao: '', quantidade: '1', valor_unitario: '', desconto: '' })
const totalItem = (i: ItemForm) => {
  const q = Number(i.quantidade.replace(',', '.')) || 0
  const u = lerMoeda(i.valor_unitario) ?? 0
  const d = lerMoeda(i.desconto) ?? 0
  return dec(q).times(u).toDecimalPlaces(2).minus(d)
}

function VendaForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const { empresas, empresaId } = useEmpresa()
  const clientes = useClientes()
  const categorias = useCategorias()
  const [f, setF] = useState({ empresa_id: empresaId ?? empresas[0]?.id ?? '', cliente_id: '', comprador_nome: '', comprador_documento: '', categoria_id: '', data_operacao: hoje(), documento: '', status: 'registrada', observacoes: '' })
  const [itens, setItens] = useState<ItemForm[]>([itemVazio()])
  const [erro, setErro] = useState('')
  const total = somar(itens.map((i) => totalItem(i).toString()))
  const salvar = useMutation({
    mutationFn: async () => {
      if (!f.cliente_id && !f.comprador_nome.trim()) throw new Error('Informe o cliente ou o nome do comprador.')
      const itensOk = itens.map((i) => ({
        descricao: i.descricao.trim(), quantidade: Number(i.quantidade.replace(',', '.')), valor_unitario: lerMoeda(i.valor_unitario), desconto: lerMoeda(i.desconto) ?? 0,
      }))
      if (itensOk.some((i) => !i.descricao || !(i.quantidade > 0) || i.valor_unitario === null)) throw new Error('Preencha descrição, quantidade e valor de todos os itens.')
      const dados = { ...f, cliente_id: f.cliente_id || null, comprador_nome: f.comprador_nome || null, comprador_documento: f.comprador_documento || null, categoria_id: f.categoria_id || null, documento: f.documento || null, observacoes: f.observacoes || null }
      const r = await supabase.rpc('criar_venda', { p_dados: dados, p_itens: itensOk })
      if (r.error) throw r.error
    },
    onSuccess: () => { qc.invalidateQueries(); toast('ok', 'Venda registrada.'); onClose() },
    onError: (e) => setErro(mensagemErro(e)),
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const setItem = (idx: number, k: keyof ItemForm, v: string) => setItens(itens.map((it, i) => (i === idx ? { ...it, [k]: v } : it)))
  return (
    <Modal titulo="Nova venda" onClose={onClose} largo>
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); setErro(''); salvar.mutate() }} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo rotulo="Empresa vendedora *"><select className="input" required value={f.empresa_id} onChange={set('empresa_id')}>{empresas.map((e) => <option key={e.id} value={e.id}>{e.nome_fantasia || e.razao_social}</option>)}</select></Campo>
        <Campo rotulo="Data da operação *"><input className="input" type="date" required value={f.data_operacao} onChange={set('data_operacao')} /></Campo>
        <Campo rotulo="Cliente cadastrado"><select className="input" value={f.cliente_id} onChange={set('cliente_id')}><option value="">Sem cadastro (comprador avulso)</option>{(clientes.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.razao_social} — {formatarCnpj(c.cnpj)}</option>)}</select></Campo>
        {!f.cliente_id && <>
          <Campo rotulo="Nome do comprador *"><input className="input" value={f.comprador_nome} onChange={set('comprador_nome')} /></Campo>
          <Campo rotulo="Documento do comprador"><input className="input" value={f.comprador_documento} onChange={set('comprador_documento')} /></Campo>
        </>}
        <Campo rotulo="Número ou referência do documento"><input className="input" value={f.documento} onChange={set('documento')} /></Campo>
        <Campo rotulo="Situação" dica="Só vendas faturadas ou recebidas entram no faturamento.">
          <select className="input" value={f.status} onChange={set('status')}><option value="registrada">Registrada</option><option value="faturada">Faturada</option><option value="recebida">Recebida</option></select>
        </Campo>
        <Campo rotulo="Categoria"><select className="input" value={f.categoria_id} onChange={set('categoria_id')}><option value="">Padrão (Vendas)</option>{(categorias.data ?? []).filter((c) => c.ativo && c.tipo_base === 'venda').map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Campo>
        <div className="sm:col-span-2">
          <div className="mb-1 text-xs font-medium text-sub">Itens</div>
          <div className="space-y-2">
            {itens.map((it, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2">
                <input className="input col-span-12 sm:col-span-5" placeholder="Mercadoria" aria-label="Descrição" value={it.descricao} onChange={(e) => setItem(idx, 'descricao', e.target.value)} />
                <input className="input col-span-3 sm:col-span-2" placeholder="Qtd" aria-label="Quantidade" inputMode="decimal" value={it.quantidade} onChange={(e) => setItem(idx, 'quantidade', e.target.value)} />
                <input className="input col-span-5 sm:col-span-2" placeholder="Unitário" aria-label="Valor unitário" inputMode="decimal" value={it.valor_unitario} onChange={(e) => setItem(idx, 'valor_unitario', e.target.value)} />
                <input className="input col-span-4 sm:col-span-2" placeholder="Desconto" aria-label="Desconto" inputMode="decimal" value={it.desconto} onChange={(e) => setItem(idx, 'desconto', e.target.value)} />
                <button type="button" className="btn-ghost col-span-12 px-2 sm:col-span-1" onClick={() => setItens(itens.length > 1 ? itens.filter((_, i) => i !== idx) : itens)} aria-label="Remover item">✕</button>
                <div className="col-span-12 -mt-1 text-right text-xs text-sub">Subtotal {moeda(totalItem(it))}</div>
              </div>
            ))}
          </div>
          <button type="button" className="btn-ghost mt-2" onClick={() => setItens([...itens, itemVazio()])}>+ Adicionar item</button>
          <div className="mt-2 text-right text-sm font-semibold">Total: {moeda(total)}</div>
        </div>
        <Campo rotulo="Observações" className="sm:col-span-2"><textarea className="input" rows={2} value={f.observacoes} onChange={set('observacoes')} /></Campo>
        {erro && <p role="alert" className="text-sm text-bad sm:col-span-2">{erro}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={salvar.isPending}>Registrar venda</button></div>
      </form>
    </Modal>
  )
}

function VendaDetalhe({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const { podeEditar } = useAuth()
  const { nomeEmpresa } = useEmpresa()
  const [ajuste, setAjuste] = useState(false)
  const [cancelar, setCancelar] = useState(false)
  const v = useQuery({ queryKey: ['venda', id], queryFn: async () => ok(await supabase.from('vendas').select('*').eq('id', id).single()) as Venda })
  const itens = useQuery({ queryKey: ['venda-itens', id], queryFn: async () => ok(await supabase.from('venda_itens').select('*').eq('venda_id', id)) as VendaItem[] })
  const ajustes = useQuery({ queryKey: ['venda-ajustes', id], queryFn: async () => ok(await supabase.from('venda_ajustes').select('*').eq('venda_id', id).order('data')) as VendaAjuste[] })
  const status = useMutation({
    mutationFn: async (s: string) => { const r = await supabase.from('vendas').update({ status: s }).eq('id', id); if (r.error) throw r.error },
    onSuccess: () => { qc.invalidateQueries(); toast('ok', 'Situação atualizada.'); setCancelar(false) },
    onError: (e) => { toast('erro', mensagemErro(e)); setCancelar(false) },
  })
  if (!v.data) return <Drawer titulo="Venda" onClose={onClose}><Carregando /></Drawer>
  const total = somar((itens.data ?? []).map((i) => i.total))
  const ajustado = somar((ajustes.data ?? []).map((a) => a.valor))
  const ro = v.data.status === 'cancelada'
  return (
    <Drawer titulo={`Venda ${v.data.documento ?? ''} — ${data(v.data.data_operacao)}`} onClose={onClose}>
      <Secao titulo="Resumo">
        <div className="card grid grid-cols-2 gap-3 text-sm">
          <div><div className="text-xs text-sub">Empresa</div>{nomeEmpresa(v.data.empresa_id)}</div>
          <div><div className="text-xs text-sub">Situação</div><Badge valor={v.data.status} /></div>
          <div><div className="text-xs text-sub">Total dos itens</div>{moeda(total)}</div>
          <div><div className="text-xs text-sub">Devoluções/estornos</div>{moeda(ajustado)}</div>
          <div className="col-span-2"><div className="text-xs text-sub">Valor líquido</div><span className="text-lg font-semibold">{moeda(total.minus(ajustado))}</span></div>
        </div>
        {podeEditar && !ro && (
          <div className="mt-2 flex flex-wrap gap-2">
            {(['registrada', 'faturada', 'recebida'] as const).filter((s) => s !== v.data!.status).map((s) => <button key={s} className="btn-ghost" onClick={() => status.mutate(s)}>Marcar como {s}</button>)}
            {Number(ajustado) === 0 && <button className="btn-ghost text-bad" onClick={() => setCancelar(true)}>Cancelar venda</button>}
          </div>
        )}
      </Secao>
      <Secao titulo="Itens">
        <Tabela linhas={itens.data ?? []} chave={(i) => i.id}
          colunas={[{ titulo: 'Mercadoria', render: (i) => i.descricao }, { titulo: 'Qtd', alinhar: 'right', render: (i) => String(i.quantidade).replace('.', ',') }, { titulo: 'Unitário', alinhar: 'right', render: (i) => moeda(i.valor_unitario) }, { titulo: 'Desconto', alinhar: 'right', render: (i) => moeda(i.desconto) }, { titulo: 'Total', alinhar: 'right', render: (i) => moeda(i.total) }]} />
      </Secao>
      <Secao titulo="Devoluções e estornos" acoes={podeEditar && !ro && <button className="btn-ghost" onClick={() => setAjuste(true)}>Registrar</button>}>
        <Tabela linhas={ajustes.data ?? []} chave={(a) => a.id} vazio="Nenhum registro."
          colunas={[{ titulo: 'Data', render: (a) => data(a.data) }, { titulo: 'Tipo', render: (a) => (a.tipo === 'devolucao' ? 'Devolução' : 'Estorno') }, { titulo: 'Valor', alinhar: 'right', render: (a) => moeda(a.valor) }, { titulo: 'Motivo', render: (a) => a.motivo ?? '—' }]} />
      </Secao>
      {ajuste && <AjusteForm vendaId={id} onClose={() => setAjuste(false)} />}
      {cancelar && <Confirmar titulo="Cancelar venda" perigo rotulo="Cancelar venda" texto="A venda deixa de contar como receita e passa a aparecer em cancelamentos. Isso não pode ser desfeito por aqui." onConfirm={() => status.mutateAsync('cancelada')} onClose={() => setCancelar(false)} />}
    </Drawer>
  )
}

function AjusteForm({ vendaId, onClose }: { vendaId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [f, setF] = useState({ tipo: 'devolucao', valor: '', data: hoje(), motivo: '' })
  const [erro, setErro] = useState('')
  const salvar = useMutation({
    mutationFn: async () => {
      const v = lerMoeda(f.valor)
      if (v === null || v <= 0) throw new Error('Informe um valor maior que zero.')
      const r = await supabase.from('venda_ajustes').insert({ venda_id: vendaId, tipo: f.tipo, valor: v, data: f.data, motivo: f.motivo || null })
      if (r.error) throw r.error
    },
    onSuccess: () => { qc.invalidateQueries(); toast('ok', 'Registrado.'); onClose() },
    onError: (e) => setErro(mensagemErro(e)),
  })
  return (
    <Modal titulo="Devolução ou estorno" onClose={onClose}>
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); setErro(''); salvar.mutate() }} className="space-y-3">
        <Campo rotulo="Tipo"><select className="input" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}><option value="devolucao">Devolução</option><option value="estorno">Estorno</option></select></Campo>
        <Campo rotulo="Valor (R$) *"><input className="input" required inputMode="decimal" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} /></Campo>
        <Campo rotulo="Data *" dica="O valor reduz o faturamento de vendas do mês desta data."><input className="input" type="date" required value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></Campo>
        <Campo rotulo="Motivo"><input className="input" value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} /></Campo>
        {erro && <p role="alert" className="text-sm text-bad">{erro}</p>}
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={salvar.isPending}>Registrar</button></div>
      </form>
    </Modal>
  )
}
