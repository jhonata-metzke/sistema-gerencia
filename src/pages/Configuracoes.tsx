import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { ok, useCategorias, useSistemas } from '@/lib/dados'
import { useEmpresa } from '@/lib/empresa-context'
import { useAuth } from '@/auth/AuthProvider'
import { DEFINICOES } from '@/lib/definicoes'
import type { Auditoria, Papel } from '@/lib/types'
import { Campo, Carregando, Confirmar, ErroBox, PageHeader, Secao, Tabela, mensagemErro, useToast } from '@/components/ui'

const ABAS = ['Cadastros de apoio', 'Usuários e permissões', 'Histórico de alterações', 'Definições dos indicadores'] as const
type Aba = (typeof ABAS)[number]

export default function Configuracoes() {
  const { isOwner, podeGerir } = useAuth()
  const [aba, setAba] = useState<Aba>('Cadastros de apoio')
  return (
    <>
      <PageHeader titulo="Configurações" subtitulo="Empresas, regimes e limites ficam em Empresas e Limite MEI." />
      <div className="mb-4 flex flex-wrap gap-1 border-b border-line" role="tablist">
        {ABAS.map((a) => (
          <button key={a} role="tab" aria-selected={aba === a} onClick={() => setAba(a)} className={`px-3 py-2 text-sm ${aba === a ? 'border-b-2 border-brand font-medium text-brand' : 'text-sub'}`}>{a}</button>
        ))}
      </div>
      {aba === 'Cadastros de apoio' && <Apoio podeGerir={podeGerir} />}
      {aba === 'Usuários e permissões' && (isOwner ? <Usuarios /> : <div className="card text-sm text-sub">Somente o proprietário gerencia usuários.</div>)}
      {aba === 'Histórico de alterações' && (isOwner ? <Historico /> : <div className="card text-sm text-sub">Somente o proprietário consulta o histórico.</div>)}
      {aba === 'Definições dos indicadores' && (
        <dl className="card space-y-3 text-sm">{Object.entries(DEFINICOES).map(([k, v]) => <div key={k}><dt className="font-medium">{k}</dt><dd className="text-sub">{v}</dd></div>)}</dl>
      )}
    </>
  )
}

function Apoio({ podeGerir }: { podeGerir: boolean }) {
  const qc = useQueryClient()
  const toast = useToast()
  const sistemas = useSistemas()
  const categorias = useCategorias()
  const [novoSistema, setNovoSistema] = useState('')
  const [novaCat, setNovaCat] = useState({ nome: '', tipo_base: 'mensalidade' })
  const [alvo, setAlvo] = useState<{ tabela: 'sistemas' | 'categorias_receita'; id: string; ativo: boolean; nome: string } | null>(null)
  const inserir = useMutation({
    mutationFn: async (a: { tabela: string; dados: object }) => { const r = await supabase.from(a.tabela).insert(a.dados); if (r.error) throw r.error },
    onSuccess: () => { qc.invalidateQueries(); toast('ok', 'Cadastro salvo.'); setNovoSistema(''); setNovaCat({ nome: '', tipo_base: 'mensalidade' }) },
    onError: (e) => toast('erro', mensagemErro(e).includes('duplicate') ? 'Este nome já existe.' : mensagemErro(e)),
  })
  const alternar = useMutation({
    mutationFn: async () => { if (!alvo) return; const r = await supabase.from(alvo.tabela).update({ ativo: !alvo.ativo }).eq('id', alvo.id); if (r.error) throw r.error },
    onSuccess: () => { qc.invalidateQueries(); setAlvo(null) }, onError: (e) => { toast('erro', mensagemErro(e)); setAlvo(null) },
  })
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Secao titulo="Sistemas utilizados pelos clientes">
        {podeGerir && <form className="mb-2 flex gap-2" onSubmit={(e: FormEvent) => { e.preventDefault(); if (novoSistema.trim()) inserir.mutate({ tabela: 'sistemas', dados: { nome: novoSistema.trim() } }) }}><input className="input" placeholder="Nome do sistema" value={novoSistema} onChange={(e) => setNovoSistema(e.target.value)} /><button className="btn-primary">Adicionar</button></form>}
        <Tabela linhas={sistemas.data ?? []} chave={(s) => s.id} vazio="Nenhum sistema cadastrado."
          colunas={[{ titulo: 'Nome', render: (s) => s.nome }, { titulo: 'Situação', render: (s) => (s.ativo ? 'Ativo' : 'Inativo') }, ...(podeGerir ? [{ titulo: '', render: (s: { id: string; ativo: boolean; nome: string }) => <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setAlvo({ tabela: 'sistemas', ...s })}>{s.ativo ? 'Desativar' : 'Ativar'}</button> }] : [])]} />
      </Secao>
      <Secao titulo="Categorias de receita">
        {podeGerir && <form className="mb-2 flex gap-2" onSubmit={(e: FormEvent) => { e.preventDefault(); if (novaCat.nome.trim()) inserir.mutate({ tabela: 'categorias_receita', dados: { nome: novaCat.nome.trim(), tipo_base: novaCat.tipo_base } }) }}>
          <input className="input" placeholder="Nome da categoria" value={novaCat.nome} onChange={(e) => setNovaCat({ ...novaCat, nome: e.target.value })} />
          <select className="input w-auto" value={novaCat.tipo_base} onChange={(e) => setNovaCat({ ...novaCat, tipo_base: e.target.value })}><option value="mensalidade">Mensalidade</option><option value="adicional">Adicional</option><option value="venda">Venda</option></select>
          <button className="btn-primary">Adicionar</button></form>}
        <Tabela linhas={categorias.data ?? []} chave={(c) => c.id}
          colunas={[{ titulo: 'Nome', render: (c) => c.nome }, { titulo: 'Tipo', render: (c) => c.tipo_base }, { titulo: 'Situação', render: (c) => (c.ativo ? 'Ativa' : 'Inativa') }, ...(podeGerir ? [{ titulo: '', render: (c: { id: string; ativo: boolean; nome: string }) => <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setAlvo({ tabela: 'categorias_receita', ...c })}>{c.ativo ? 'Desativar' : 'Ativar'}</button> }] : [])]} />
        <p className="mt-1 text-xs text-sub">A primeira categoria ativa de cada tipo (ordem alfabética) é a padrão para registros sem categoria.</p>
      </Secao>
      {alvo && <Confirmar titulo={alvo.ativo ? 'Desativar' : 'Ativar'} texto={`${alvo.ativo ? 'Desativar' : 'Ativar'} “${alvo.nome}”? Registros existentes não são alterados.`} onConfirm={() => alternar.mutateAsync()} onClose={() => setAlvo(null)} />}
    </div>
  )
}

interface LinhaUsuario { user_id: string; email: string; papel_id: string | null; empresa_id: string | null; papel: Papel | null }
function Usuarios() {
  const qc = useQueryClient()
  const toast = useToast()
  const { empresas, nomeEmpresa } = useEmpresa()
  const q = useQuery({ queryKey: ['usuarios'], queryFn: async () => ok(await supabase.rpc('listar_usuarios')) as LinhaUsuario[] })
  const [f, setF] = useState({ email: '', empresa_id: '', papel: 'operador' })
  const [remover, setRemover] = useState<LinhaUsuario | null>(null)
  const atribuir = useMutation({
    mutationFn: async () => { const r = await supabase.rpc('atribuir_papel', { p_email: f.email, p_empresa: f.empresa_id, p_papel: f.papel }); if (r.error) throw r.error },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['usuarios'] }); toast('ok', 'Permissão concedida.') }, onError: (e) => toast('erro', mensagemErro(e)),
  })
  const tirar = useMutation({
    mutationFn: async (id: string) => { const r = await supabase.rpc('remover_papel', { p_id: id }); if (r.error) throw r.error },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['usuarios'] }); toast('ok', 'Permissão removida.'); setRemover(null) }, onError: (e) => { toast('erro', mensagemErro(e)); setRemover(null) },
  })
  if (q.isLoading) return <Carregando />
  if (q.error) return <ErroBox erro={q.error} />
  return (
    <>
      <Secao titulo="Conceder acesso a uma empresa">
        <form className="card grid grid-cols-1 gap-3 sm:grid-cols-4" onSubmit={(e: FormEvent) => { e.preventDefault(); atribuir.mutate() }}>
          <Campo rotulo="E-mail da conta" className="sm:col-span-2" dica="A pessoa precisa criar a conta antes."><input className="input" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Campo>
          <Campo rotulo="Empresa"><select className="input" required value={f.empresa_id} onChange={(e) => setF({ ...f, empresa_id: e.target.value })}><option value="">Selecione…</option>{empresas.map((e) => <option key={e.id} value={e.id}>{e.nome_fantasia || e.razao_social}</option>)}</select></Campo>
          <Campo rotulo="Função"><select className="input" value={f.papel} onChange={(e) => setF({ ...f, papel: e.target.value })}><option value="gestor">Gestor (configura e gerencia)</option><option value="operador">Operador (lança dados)</option><option value="leitor">Leitor (só consulta)</option></select></Campo>
          <div className="sm:col-span-4"><button className="btn-primary" disabled={atribuir.isPending}>Conceder</button></div>
        </form>
      </Secao>
      <Secao titulo="Usuários e permissões">
        <Tabela linhas={q.data ?? []} chave={(u) => `${u.user_id}-${u.papel_id}`} colunas={[
          { titulo: 'E-mail', render: (u) => u.email }, { titulo: 'Empresa', render: (u) => (u.papel === 'owner' ? 'Todas' : u.empresa_id ? nomeEmpresa(u.empresa_id) : '—') },
          { titulo: 'Função', render: (u) => u.papel ?? 'sem acesso' },
          { titulo: '', render: (u) => (u.papel_id && u.papel !== 'owner' ? <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setRemover(u)}>Remover</button> : null) }]} />
        <p className="mt-1 text-xs text-sub">Dica de segurança: após criar as contas necessárias, desative novos cadastros (sign-ups) no backend.</p>
      </Secao>
      {remover && <Confirmar titulo="Remover permissão" perigo rotulo="Remover" texto={`Remover o acesso de ${remover.email}?`} onConfirm={() => tirar.mutateAsync(remover.papel_id!)} onClose={() => setRemover(null)} />}
    </>
  )
}

function Historico() {
  const [tabela, setTabela] = useState('')
  const q = useQuery({
    queryKey: ['auditoria', tabela],
    queryFn: async () => { let r = supabase.from('auditoria').select('*').order('em', { ascending: false }).limit(200); if (tabela) r = r.eq('tabela', tabela); return ok(await r) as Auditoria[] },
  })
  const TABELAS = ['empresas', 'clientes', 'contratos', 'contrato_versoes', 'adicionais', 'cobrancas', 'pagamentos', 'vendas', 'venda_ajustes', 'parametros_limite', 'papeis_usuario']
  return (
    <>
      <select className="input mb-3 w-auto" value={tabela} onChange={(e) => setTabela(e.target.value)} aria-label="Tabela"><option value="">Todas as tabelas</option>{TABELAS.map((t) => <option key={t} value={t}>{t}</option>)}</select>
      {q.isLoading ? <Carregando /> : q.error ? <ErroBox erro={q.error} /> : (
        <Tabela linhas={q.data ?? []} chave={(h) => String(h.id)} vazio="Nenhuma alteração registrada." colunas={[
          { titulo: 'Quando', render: (h) => new Date(h.em).toLocaleString('pt-BR') }, { titulo: 'Tabela', render: (h) => h.tabela }, { titulo: 'Ação', render: (h) => h.acao },
          { titulo: 'Detalhe', render: (h) => <details><summary className="cursor-pointer text-brand">ver</summary><pre className="max-w-md overflow-x-auto text-xs">{JSON.stringify({ antes: h.antes, depois: h.depois }, null, 1)}</pre></details> }]} />
      )}
      <p className="mt-1 text-xs text-sub">Últimos 200 registros.</p>
    </>
  )
}
