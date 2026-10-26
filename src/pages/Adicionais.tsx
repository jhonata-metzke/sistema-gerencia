import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { ok, useCategorias, useClientes } from '@/lib/dados'
import { useEmpresa } from '@/lib/empresa-context'
import { useAuth } from '@/auth/AuthProvider'
import { formatarCnpj } from '@/lib/cnpj'
import { lerMoeda, moeda } from '@/lib/money'
import { competencia, hoje } from '@/lib/datas'
import type { Adicional, ContratoLista, Periodicidade } from '@/lib/types'
import { Badge, Busca, Campo, Carregando, ErroBox, Modal, PageHeader, Tabela, mensagemErro, useToast } from '@/components/ui'

const ROTULO: Record<Periodicidade, string> = { unica: 'Avulso', mensal: 'Mensal', anual: 'Anual', intervalo: 'Outra frequência' }

export default function Adicionais() {
  const { empresaId, nomeEmpresa } = useEmpresa()
  const { podeEditar } = useAuth()
  const clientes = useClientes()
  const [busca, setBusca] = useState('')
  const [editando, setEditando] = useState<Partial<Adicional> | null>(null)
  const q = useQuery({
    queryKey: ['adicionais', empresaId],
    queryFn: async () => {
      let r = supabase.from('adicionais').select('*').order('competencia', { ascending: false })
      if (empresaId) r = r.eq('empresa_id', empresaId)
      return ok(await r) as Adicional[]
    },
  })
  const nomeCli = (id: string) => clientes.data?.find((c) => c.id === id)?.razao_social ?? '—'
  const linhas = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return (q.data ?? []).filter((a) => !t || a.descricao.toLowerCase().includes(t) || nomeCli(a.cliente_id).toLowerCase().includes(t))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data, busca, clientes.data])

  return (
    <>
      <PageHeader titulo="Adicionais" subtitulo="Valores extras cobrados dos clientes. Entram na cobrança uma única vez."
        acoes={podeEditar && <button className="btn-primary" onClick={() => setEditando({})}>Novo adicional</button>} />
      <div className="mb-3"><Busca valor={busca} onChange={setBusca} placeholder="Cliente ou descrição" /></div>
      {q.isLoading ? <Carregando /> : q.error ? <ErroBox erro={q.error} /> : (
        <Tabela linhas={linhas} chave={(a) => a.id} aoClicar={podeEditar ? setEditando : undefined}
          colunas={[
            { titulo: 'Cliente', render: (a) => nomeCli(a.cliente_id) },
            ...(empresaId ? [] : [{ titulo: 'Empresa', render: (a: Adicional) => nomeEmpresa(a.empresa_id) }]),
            { titulo: 'Descrição', render: (a) => a.descricao },
            { titulo: 'Competência', render: (a) => competencia(a.competencia) },
            { titulo: 'Periodicidade', render: (a) => ROTULO[a.periodicidade] },
            { titulo: 'Valor', alinhar: 'right', render: (a) => moeda(a.valor) },
            { titulo: 'Situação', render: (a) => <Badge valor={a.situacao === 'ativo' ? 'ativo' : a.situacao === 'cancelado' ? 'cancelada' : 'encerrado'} /> },
          ]} />
      )}
      {editando && <AdicionalForm inicial={editando} onClose={() => setEditando(null)} />}
    </>
  )
}

function AdicionalForm({ inicial, onClose }: { inicial: Partial<Adicional>; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const { empresas, empresaId } = useEmpresa()
  const clientes = useClientes()
  const categorias = useCategorias()
  const [f, setF] = useState({
    empresa_id: inicial.empresa_id ?? empresaId ?? empresas[0]?.id ?? '', cliente_id: inicial.cliente_id ?? '', contrato_id: inicial.contrato_id ?? '',
    categoria_id: inicial.categoria_id ?? '', descricao: inicial.descricao ?? '', valor: inicial.valor != null ? String(inicial.valor).replace('.', ',') : '',
    data: inicial.data ?? hoje(), competencia: (inicial.competencia ?? hoje().slice(0, 8) + '01').slice(0, 7), periodicidade: inicial.periodicidade ?? 'unica',
    intervalo_meses: String(inicial.intervalo_meses ?? 3), fim_em: inicial.fim_em ?? '', situacao: inicial.situacao ?? 'ativo', emite_nf: inicial.emite_nf ?? false, observacoes: inicial.observacoes ?? '',
  })
  const [erro, setErro] = useState('')
  const contratos = useQuery({
    queryKey: ['contratos-cliente', f.empresa_id, f.cliente_id], enabled: Boolean(f.cliente_id && f.empresa_id),
    queryFn: async () => ok(await supabase.from('v_contratos_lista').select('*').eq('cliente_id', f.cliente_id).eq('empresa_id', f.empresa_id).eq('situacao', 'ativo')) as ContratoLista[],
  })
  const salvar = useMutation({
    mutationFn: async () => {
      const v = lerMoeda(f.valor)
      if (v === null || v <= 0) throw new Error('Informe um valor maior que zero.')
      const dados = {
        empresa_id: f.empresa_id, cliente_id: f.cliente_id, contrato_id: f.contrato_id || null, categoria_id: f.categoria_id || null, descricao: f.descricao, valor: v,
        data: f.data, competencia: `${f.competencia}-01`, periodicidade: f.periodicidade, intervalo_meses: f.periodicidade === 'intervalo' ? Number(f.intervalo_meses) : null,
        fim_em: f.fim_em || null, situacao: f.situacao, emite_nf: f.emite_nf, observacoes: f.observacoes || null,
      }
      const r = inicial.id ? await supabase.from('adicionais').update(dados).eq('id', inicial.id) : await supabase.from('adicionais').insert(dados)
      if (r.error) throw r.error
    },
    onSuccess: () => { qc.invalidateQueries(); toast('ok', 'Adicional salvo. Gere as cobranças da competência para incluí-lo.'); onClose() },
    onError: (e) => setErro(mensagemErro(e)),
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  return (
    <Modal titulo={inicial.id ? 'Editar adicional' : 'Novo adicional'} onClose={onClose} largo>
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); setErro(''); salvar.mutate() }} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo rotulo="Empresa responsável *"><select className="input" required value={f.empresa_id} onChange={set('empresa_id')} disabled={Boolean(inicial.id)}>{empresas.map((e) => <option key={e.id} value={e.id}>{e.nome_fantasia || e.razao_social}</option>)}</select></Campo>
        <Campo rotulo="Cliente *"><select className="input" required value={f.cliente_id} onChange={set('cliente_id')} disabled={Boolean(inicial.id)}><option value="">Selecione…</option>{(clientes.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.razao_social} — {formatarCnpj(c.cnpj)}</option>)}</select></Campo>
        <Campo rotulo="Contrato relacionado" dica="Opcional. Sem contrato, gera cobrança própria.">
          <select className="input" value={f.contrato_id} onChange={set('contrato_id')} disabled={Boolean(inicial.id)}><option value="">Nenhum</option>{(contratos.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.descricao}</option>)}</select>
        </Campo>
        <Campo rotulo="Categoria"><select className="input" value={f.categoria_id} onChange={set('categoria_id')}><option value="">Padrão (Adicionais)</option>{(categorias.data ?? []).filter((c) => c.ativo && c.tipo_base === 'adicional').map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Campo>
        <Campo rotulo="Descrição *" className="sm:col-span-2"><input className="input" required value={f.descricao} onChange={set('descricao')} placeholder="Suporte extra, manutenção, equipamento…" /></Campo>
        <Campo rotulo="Valor (R$) *"><input className="input" required inputMode="decimal" value={f.valor} onChange={set('valor')} /></Campo>
        <Campo rotulo="Data"><input className="input" type="date" value={f.data} onChange={set('data')} /></Campo>
        <Campo rotulo="Competência (primeira cobrança) *"><input className="input" type="month" required value={f.competencia} onChange={set('competencia')} disabled={Boolean(inicial.id)} /></Campo>
        <Campo rotulo="Periodicidade"><select className="input" value={f.periodicidade} onChange={set('periodicidade')} disabled={Boolean(inicial.id)}>{Object.entries(ROTULO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
        {f.periodicidade === 'intervalo' && <Campo rotulo="A cada quantos meses"><input className="input" type="number" min={1} value={f.intervalo_meses} onChange={set('intervalo_meses')} /></Campo>}
        {f.periodicidade !== 'unica' && <Campo rotulo="Recorrência termina em"><input className="input" type="date" value={f.fim_em} onChange={set('fim_em')} /></Campo>}
        <Campo rotulo="Situação"><select className="input" value={f.situacao} onChange={set('situacao')}><option value="ativo">Ativo</option><option value="encerrado">Encerrado</option><option value="cancelado">Cancelado</option></select></Campo>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.emite_nf} onChange={(e) => setF({ ...f, emite_nf: e.target.checked })} /> Precisa de nota fiscal</label>
        <Campo rotulo="Observações" className="sm:col-span-2"><textarea className="input" rows={2} value={f.observacoes} onChange={set('observacoes')} /></Campo>
        {erro && <p role="alert" className="text-sm text-bad sm:col-span-2">{erro}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={salvar.isPending}>Salvar</button></div>
      </form>
    </Modal>
  )
}
