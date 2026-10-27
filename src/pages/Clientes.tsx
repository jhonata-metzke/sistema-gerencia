import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { ok, useClientes } from '@/lib/dados'
import { useEmpresa } from '@/lib/empresa-context'
import { useAuth } from '@/auth/AuthProvider'
import { cnpjValido, formatarCnpj, normalizarCnpj } from '@/lib/cnpj'
import { moeda } from '@/lib/money'
import { competencia, data } from '@/lib/datas'
import type { Adicional, Auditoria, Cliente, CobrancaView, ContratoLista, Venda } from '@/lib/types'
import { Badge, Busca, Campo, Carregando, Detalhe, Drawer, ErroBox, Modal, PageHeader, Secao, Tabela, mensagemErro, useToast } from '@/components/ui'

export default function Clientes() {
  const { podeEditar } = useAuth()
  const q = useClientes()
  const [busca, setBusca] = useState('')
  const [situacao, setSituacao] = useState<'todos' | 'ativos' | 'inativos'>('ativos')
  const [editando, setEditando] = useState<Partial<Cliente> | null>(null)
  const [aberto, setAberto] = useState<Cliente | null>(null)

  const linhas = useMemo(() => {
    const t = busca.trim().toLowerCase()
    const n = normalizarCnpj(busca).toLowerCase()
    return (q.data ?? []).filter((c) =>
      (situacao === 'todos' || (situacao === 'ativos') === c.ativo) &&
      (!t || c.razao_social.toLowerCase().includes(t) || (n && c.cnpj.toLowerCase().includes(n)) || (c.nome_fantasia ?? '').toLowerCase().includes(t)))
  }, [q.data, busca, situacao])

  return (
    <>
      <PageHeader titulo="Clientes" subtitulo="Cadastro único: o mesmo cliente pode ter contratos em empresas diferentes."
        acoes={podeEditar && <button className="btn-primary" onClick={() => setEditando({ ativo: true })}>Novo cliente</button>} />
      <div className="mb-3 flex flex-wrap gap-2">
        <Busca valor={busca} onChange={setBusca} placeholder="Razão social ou CNPJ" />
        <select className="input w-auto" value={situacao} onChange={(e) => setSituacao(e.target.value as typeof situacao)} aria-label="Situação">
          <option value="ativos">Ativos</option><option value="inativos">Inativos</option><option value="todos">Todos</option>
        </select>
      </div>
      {q.isLoading ? <Carregando /> : q.error ? <ErroBox erro={q.error} /> : (
        <Tabela linhas={linhas} chave={(c) => c.id} aoClicar={setAberto}
          colunas={[
            { titulo: 'Razão social', render: (c) => c.razao_social },
            { titulo: 'CNPJ', render: (c) => formatarCnpj(c.cnpj) },
            { titulo: 'Contato', render: (c) => c.telefone || c.email || '—' },
            { titulo: 'Situação', render: (c) => <Badge valor={c.ativo ? 'ativo' : 'inativo'} /> },
          ]} />
      )}
      {aberto && <ClienteDetalhe cliente={aberto} onClose={() => setAberto(null)} onEditar={podeEditar ? () => { setEditando(aberto); setAberto(null) } : undefined} />}
      {editando && <ClienteForm inicial={editando} onClose={() => setEditando(null)} />}
    </>
  )
}

function ClienteDetalhe({ cliente, onClose, onEditar }: { cliente: Cliente; onClose: () => void; onEditar?: (() => void) | undefined }) {
  const { nomeEmpresa } = useEmpresa()
  const { isOwner } = useAuth()
  const id = cliente.id
  const contratos = useQuery({ queryKey: ['cli-contratos', id], queryFn: async () => ok(await supabase.from('v_contratos_lista').select('*').eq('cliente_id', id).order('inicio_em', { ascending: false })) as ContratoLista[] })
  const cobrancas = useQuery({ queryKey: ['cli-cobrancas', id], queryFn: async () => ok(await supabase.from('v_cobrancas').select('*').eq('cliente_id', id).order('competencia', { ascending: false }).limit(60)) as CobrancaView[] })
  const vendas = useQuery({ queryKey: ['cli-vendas', id], queryFn: async () => ok(await supabase.from('vendas').select('*').eq('cliente_id', id).order('data_operacao', { ascending: false })) as Venda[] })
  const adicionais = useQuery({ queryKey: ['cli-adicionais', id], queryFn: async () => ok(await supabase.from('adicionais').select('*').eq('cliente_id', id).order('competencia', { ascending: false })) as Adicional[] })
  const historico = useQuery({ enabled: isOwner, queryKey: ['cli-hist', id], queryFn: async () => ok(await supabase.from('auditoria').select('*').eq('tabela', 'clientes').eq('registro_id', id).order('em', { ascending: false })) as Auditoria[] })

  return (
    <Drawer titulo={cliente.razao_social} onClose={onClose}>
      <Secao titulo="Cadastro" acoes={onEditar && <button className="btn-ghost" onClick={onEditar}>Editar</button>}>
        <dl className="card grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Detalhe rotulo="CNPJ">{formatarCnpj(cliente.cnpj)}</Detalhe>
          <Detalhe rotulo="Nome fantasia">{cliente.nome_fantasia}</Detalhe>
          <Detalhe rotulo="Inscrição estadual">{cliente.inscricao_estadual}</Detalhe>
          <Detalhe rotulo="Telefone">{cliente.telefone}</Detalhe>
          <Detalhe rotulo="E-mail">{cliente.email}</Detalhe>
          <Detalhe rotulo="Endereço">{cliente.endereco}</Detalhe>
          <Detalhe rotulo="Observações">{cliente.observacoes}</Detalhe>
          <Detalhe rotulo="Situação"><Badge valor={cliente.ativo ? 'ativo' : 'inativo'} /></Detalhe>
        </dl>
      </Secao>
      <Secao titulo="Contratos">
        <Tabela linhas={contratos.data ?? []} chave={(c) => c.id} vazio="Sem contratos."
          colunas={[{ titulo: 'Empresa', render: (c) => nomeEmpresa(c.empresa_id) }, { titulo: 'Descrição', render: (c) => c.descricao },
            { titulo: 'Valor', alinhar: 'right', render: (c) => moeda(c.valor_atual) }, { titulo: 'Situação', render: (c) => <Badge valor={c.situacao} /> }]} />
      </Secao>
      <Secao titulo="Cobranças (últimas 60)">
        <Tabela linhas={cobrancas.data ?? []} chave={(c) => c.id} vazio="Sem cobranças."
          colunas={[{ titulo: 'Empresa', render: (c) => nomeEmpresa(c.empresa_id) }, { titulo: 'Competência', render: (c) => competencia(c.competencia) },
            { titulo: 'Vencimento', render: (c) => data(c.vencimento) }, { titulo: 'Total', alinhar: 'right', render: (c) => moeda(c.valor_total) }, { titulo: 'Situação', render: (c) => <Badge valor={c.status_exibicao} /> }]} />
      </Secao>
      <Secao titulo="Adicionais">
        <Tabela linhas={adicionais.data ?? []} chave={(a) => a.id} vazio="Sem adicionais."
          colunas={[{ titulo: 'Empresa', render: (a) => nomeEmpresa(a.empresa_id) }, { titulo: 'Descrição', render: (a) => a.descricao },
            { titulo: 'Valor', alinhar: 'right', render: (a) => moeda(a.valor) }, { titulo: 'Periodicidade', render: (a) => a.periodicidade }]} />
      </Secao>
      <Secao titulo="Vendas">
        <Tabela linhas={vendas.data ?? []} chave={(v) => v.id} vazio="Sem vendas."
          colunas={[{ titulo: 'Empresa', render: (v) => nomeEmpresa(v.empresa_id) }, { titulo: 'Data', render: (v) => data(v.data_operacao) },
            { titulo: 'Documento', render: (v) => v.documento ?? '—' }, { titulo: 'Situação', render: (v) => <Badge valor={v.status} /> }]} />
      </Secao>
      {isOwner && (
        <Secao titulo="Histórico de alterações">
          <Tabela linhas={historico.data ?? []} chave={(h) => String(h.id)} vazio="Sem alterações registradas."
            colunas={[{ titulo: 'Quando', render: (h) => new Date(h.em).toLocaleString('pt-BR') }, { titulo: 'Ação', render: (h) => h.acao }]} />
        </Secao>
      )}
    </Drawer>
  )
}

function ClienteForm({ inicial, onClose }: { inicial: Partial<Cliente>; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [f, setF] = useState({
    razao_social: inicial.razao_social ?? '', cnpj: inicial.cnpj ? formatarCnpj(inicial.cnpj) : '', nome_fantasia: inicial.nome_fantasia ?? '',
    inscricao_estadual: inicial.inscricao_estadual ?? '', telefone: inicial.telefone ?? '', email: inicial.email ?? '',
    endereco: inicial.endereco ?? '', observacoes: inicial.observacoes ?? '', ativo: inicial.ativo ?? true,
  })
  const [erro, setErro] = useState('')
  const salvar = useMutation({
    mutationFn: async () => {
      const vazio = (v: string) => v.trim() || null
      const dados = { ...f, nome_fantasia: vazio(f.nome_fantasia), inscricao_estadual: vazio(f.inscricao_estadual), telefone: vazio(f.telefone), email: vazio(f.email), endereco: vazio(f.endereco), observacoes: vazio(f.observacoes) }
      const r = inicial.id ? await supabase.from('clientes').update(dados).eq('id', inicial.id) : await supabase.from('clientes').insert(dados)
      if (r.error) throw r.error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clientes'] }); toast('ok', 'Cliente salvo.'); onClose() },
    onError: (e) => setErro(mensagemErro(e)),
  })
  function enviar(e: FormEvent) {
    e.preventDefault()
    if (!cnpjValido(f.cnpj)) return setErro('CNPJ inválido.')
    setErro(''); salvar.mutate()
  }
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  return (
    <Modal titulo={inicial.id ? 'Editar cliente' : 'Novo cliente'} onClose={onClose} largo>
      <form onSubmit={enviar} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo rotulo="Razão social *" className="sm:col-span-2"><input className="input" required value={f.razao_social} onChange={set('razao_social')} /></Campo>
        <Campo rotulo="CNPJ *"><input className="input" required value={f.cnpj} onChange={set('cnpj')} placeholder="00.000.000/0000-00" /></Campo>
        <Campo rotulo="Nome fantasia"><input className="input" value={f.nome_fantasia} onChange={set('nome_fantasia')} /></Campo>
        <Campo rotulo="Inscrição estadual"><input className="input" value={f.inscricao_estadual} onChange={set('inscricao_estadual')} /></Campo>
        <Campo rotulo="Telefone"><input className="input" value={f.telefone} onChange={set('telefone')} /></Campo>
        <Campo rotulo="E-mail"><input className="input" type="email" value={f.email} onChange={set('email')} /></Campo>
        <Campo rotulo="Situação">
          <select className="input" value={f.ativo ? '1' : '0'} onChange={(e) => setF({ ...f, ativo: e.target.value === '1' })}><option value="1">Ativo</option><option value="0">Inativo</option></select>
        </Campo>
        <Campo rotulo="Endereço" className="sm:col-span-2"><input className="input" value={f.endereco} onChange={set('endereco')} /></Campo>
        <Campo rotulo="Observações" className="sm:col-span-2"><textarea className="input" rows={3} value={f.observacoes} onChange={set('observacoes')} /></Campo>
        {erro && <p role="alert" className="text-sm text-bad sm:col-span-2">{erro}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={salvar.isPending}>Salvar</button></div>
      </form>
    </Modal>
  )
}
