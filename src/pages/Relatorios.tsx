import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ok, useCategorias, useClientes } from '@/lib/dados'
import { useEmpresa } from '@/lib/empresa-context'
import { TIPOS } from '@/lib/faturamento'
import { exportarCsv, exportarXlsx, type LinhaExport } from '@/lib/exportar'
import { formatarCnpj } from '@/lib/cnpj'
import { dec, moeda, somar } from '@/lib/money'
import { competencia, data, hoje } from '@/lib/datas'
import type { Adicional, Cliente, CobrancaView, ContratoLista, FaturamentoMensal, LimiteSituacao, Venda } from '@/lib/types'
import { Campo, Carregando, ErroBox, PageHeader, Tabela, mensagemErro } from '@/components/ui'

interface Filtros { de: string; ate: string; empresaId: string | null; clienteId: string; categoriaId: string; nomeEmpresa: (id: string) => string }
interface Relatorio { id: string; titulo: string; descricao: string; rodar: (f: Filtros) => Promise<LinhaExport[]> }

const mes1 = (d: string) => d.slice(0, 7) + '-01'
const R = (v: number | string) => Number(dec(v).toFixed(2))

async function faturamentoMensal(f: Filtros) {
  let r = supabase.from('v_faturamento_mensal').select('*')
  if (f.empresaId) r = r.eq('empresa_id', f.empresaId)
  if (f.categoriaId) r = r.eq('categoria_id', f.categoriaId)
  const linhas = ok(await r) as FaturamentoMensal[]
  const de = mes1(f.de), ate = mes1(f.ate)
  return linhas.filter((l) => { const c = `${l.ano}-${String(l.mes).padStart(2, '0')}-01`; return c >= de && c <= ate })
}

function agrupar<T>(linhas: T[], chave: (l: T) => string, valor: (l: T) => string | number) {
  const m = new Map<string, ReturnType<typeof somar>>()
  for (const l of linhas) m.set(chave(l), (m.get(chave(l)) ?? dec(0)).plus(dec(valor(l))))
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b))
}

const RELATORIOS: Relatorio[] = [
  { id: 'clientes', titulo: 'Cadastro de clientes', descricao: 'Todos os clientes visíveis, com situação.', rodar: async (f) => {
    let r = supabase.from('clientes').select('*').order('razao_social'); if (f.clienteId) r = r.eq('id', f.clienteId)
    return (ok(await r) as Cliente[]).map((c) => ({ 'Razão social': c.razao_social, CNPJ: formatarCnpj(c.cnpj), 'Nome fantasia': c.nome_fantasia, Telefone: c.telefone, 'E-mail': c.email, Situação: c.ativo ? 'Ativo' : 'Inativo' }))
  } },
  { id: 'mensalidades', titulo: 'Mensalidades contratadas', descricao: 'Contratos ativos com o valor vigente hoje.', rodar: async (f) => {
    let r = supabase.from('v_contratos_lista').select('*').eq('situacao', 'ativo').order('cliente_razao_social')
    if (f.empresaId) r = r.eq('empresa_id', f.empresaId); if (f.clienteId) r = r.eq('cliente_id', f.clienteId)
    return (ok(await r) as ContratoLista[]).map((c) => ({ Empresa: f.nomeEmpresa(c.empresa_id), 'Razão social': c.cliente_razao_social, CNPJ: formatarCnpj(c.cliente_cnpj), Descrição: c.descricao, Sistema: c.sistema_nome, Periodicidade: c.periodicidade, 'Vencimento (dia)': c.dia_vencimento, 'Valor (R$)': c.valor_atual }))
  } },
  { id: 'mensalidades-empresa', titulo: 'Mensalidades por empresa', descricao: 'Soma dos contratos ativos por empresa e periodicidade.', rodar: async (f) => {
    let r = supabase.from('v_contratos_lista').select('*').eq('situacao', 'ativo')
    if (f.empresaId) r = r.eq('empresa_id', f.empresaId)
    const l = ok(await r) as ContratoLista[]
    return agrupar(l, (c) => `${f.nomeEmpresa(c.empresa_id)}|${c.periodicidade}`, (c) => c.valor_atual ?? 0).map(([k, v]) => { const [e, p] = k.split('|'); return { Empresa: e, Periodicidade: p, Contratos: l.filter((c) => `${f.nomeEmpresa(c.empresa_id)}|${c.periodicidade}` === k).length, 'Valor (R$)': R(v.toString()) } })
  } },
  { id: 'cobrancas-vencimento', titulo: 'Cobranças por vencimento', descricao: 'Cobranças com vencimento no período.', rodar: async (f) => {
    let r = supabase.from('v_cobrancas').select('*').gte('vencimento', f.de).lte('vencimento', f.ate).order('vencimento')
    if (f.empresaId) r = r.eq('empresa_id', f.empresaId); if (f.clienteId) r = r.eq('cliente_id', f.clienteId)
    return (ok(await r) as CobrancaView[]).map((c) => ({ Vencimento: data(c.vencimento), Empresa: f.nomeEmpresa(c.empresa_id), Cliente: c.cliente_razao_social, CNPJ: formatarCnpj(c.cliente_cnpj), Competência: competencia(c.competencia), 'Total (R$)': c.valor_total, 'Pago (R$)': c.valor_pago, 'Pendente (R$)': c.valor_pendente, Situação: c.status_exibicao }))
  } },
  { id: 'cobrancas-pagas-pendentes', titulo: 'Cobranças pagas e pendentes', descricao: 'Por competência no período; canceladas ficam de fora.', rodar: async (f) => {
    let r = supabase.from('v_cobrancas').select('*').gte('competencia', mes1(f.de)).lte('competencia', mes1(f.ate)).neq('status_exibicao', 'cancelada').order('competencia')
    if (f.empresaId) r = r.eq('empresa_id', f.empresaId); if (f.clienteId) r = r.eq('cliente_id', f.clienteId)
    return (ok(await r) as CobrancaView[]).map((c) => ({ Competência: competencia(c.competencia), Empresa: f.nomeEmpresa(c.empresa_id), Cliente: c.cliente_razao_social, 'Total (R$)': c.valor_total, 'Recebido (R$)': c.valor_pago, 'Pendente (R$)': c.valor_pendente, Situação: c.status_exibicao }))
  } },
  { id: 'inadimplentes', titulo: 'Clientes inadimplentes', descricao: 'Cobranças vencidas e não quitadas, agrupadas por cliente (posição de hoje).', rodar: async (f) => {
    let r = supabase.from('v_cobrancas').select('*').eq('vencida', true).order('vencimento')
    if (f.empresaId) r = r.eq('empresa_id', f.empresaId); if (f.clienteId) r = r.eq('cliente_id', f.clienteId)
    const l = ok(await r) as CobrancaView[]
    return agrupar(l, (c) => `${c.cliente_razao_social}|${c.cliente_cnpj}`, (c) => c.valor_pendente).map(([k, v]) => {
      const [nome, cnpj] = k.split('|'); const doCli = l.filter((c) => c.cliente_razao_social === nome && c.cliente_cnpj === cnpj)
      return { Cliente: nome, CNPJ: formatarCnpj(cnpj), 'Cobranças vencidas': doCli.length, 'Vencida mais antiga': data(doCli[0].vencimento), 'Valor em atraso (R$)': R(v.toString()) }
    })
  } },
  { id: 'adicionais', titulo: 'Adicionais por cliente', descricao: 'Adicionais com competência inicial no período.', rodar: async (f) => {
    let r = supabase.from('adicionais').select('*, clientes(razao_social, cnpj)').gte('competencia', mes1(f.de)).lte('competencia', mes1(f.ate)).order('competencia')
    if (f.empresaId) r = r.eq('empresa_id', f.empresaId); if (f.clienteId) r = r.eq('cliente_id', f.clienteId); if (f.categoriaId) r = r.eq('categoria_id', f.categoriaId)
    return (ok(await r) as unknown as Array<Adicional & { clientes: { razao_social: string; cnpj: string } }>).map((a) => ({ Cliente: a.clientes.razao_social, CNPJ: formatarCnpj(a.clientes.cnpj), Empresa: f.nomeEmpresa(a.empresa_id), Descrição: a.descricao, Competência: competencia(a.competencia), Periodicidade: a.periodicidade, Situação: a.situacao, 'Valor (R$)': a.valor }))
  } },
  { id: 'vendas', titulo: 'Vendas de mercadorias', descricao: 'Vendas do período com total e situação (inclui canceladas, identificadas).', rodar: async (f) => {
    let r = supabase.from('vendas').select('*, venda_itens(total), venda_ajustes(valor), clientes(razao_social)').gte('data_operacao', f.de).lte('data_operacao', f.ate).order('data_operacao')
    if (f.empresaId) r = r.eq('empresa_id', f.empresaId); if (f.clienteId) r = r.eq('cliente_id', f.clienteId); if (f.categoriaId) r = r.eq('categoria_id', f.categoriaId)
    return (ok(await r) as unknown as Array<Venda & { venda_itens: Array<{ total: number }>; venda_ajustes: Array<{ valor: number }>; clientes: { razao_social: string } | null }>).map((v) => {
      const t = somar(v.venda_itens.map((i) => i.total)); const a = somar(v.venda_ajustes.map((x) => x.valor))
      return { Data: data(v.data_operacao), Empresa: f.nomeEmpresa(v.empresa_id), Comprador: v.clientes?.razao_social ?? v.comprador_nome, Documento: v.documento, Situação: v.status, 'Total (R$)': R(t.toString()), 'Devoluções/estornos (R$)': R(a.toString()), 'Líquido (R$)': R(t.minus(a).toString()) }
    })
  } },
  { id: 'fat-mensal', titulo: 'Faturamento mensal', descricao: 'Por mês e tipo de receita (mesmos critérios do dashboard).', rodar: async (f) => {
    const l = await faturamentoMensal(f)
    return agrupar(l, (x) => `${x.ano}-${String(x.mes).padStart(2, '0')}|${x.tipo}`, (x) => x.valor).map(([k, v]) => { const [c, t] = k.split('|'); return { Competência: competencia(c + '-01'), Tipo: TIPOS[t as keyof typeof TIPOS], 'Faturamento (R$)': R(v.toString()) } })
  } },
  { id: 'fat-anual', titulo: 'Faturamento anual', descricao: 'Por ano e tipo de receita.', rodar: async (f) => {
    const l = await faturamentoMensal({ ...f, de: '2000-01-01', ate: '2100-12-01' })
    return agrupar(l, (x) => `${x.ano}|${x.tipo}`, (x) => x.valor).map(([k, v]) => { const [a, t] = k.split('|'); return { Ano: Number(a), Tipo: TIPOS[t as keyof typeof TIPOS], 'Faturamento (R$)': R(v.toString()) } })
  } },
  { id: 'fat-cnpj', titulo: 'Faturamento por CNPJ', descricao: 'Total por empresa no período, por tipo.', rodar: async (f) => {
    const l = await faturamentoMensal(f)
    return agrupar(l, (x) => `${f.nomeEmpresa(x.empresa_id)}|${x.tipo}`, (x) => x.valor).map(([k, v]) => { const [e, t] = k.split('|'); return { Empresa: e, Tipo: TIPOS[t as keyof typeof TIPOS], 'Faturamento (R$)': R(v.toString()) } })
  } },
  { id: 'fat-consolidado', titulo: 'Faturamento consolidado', descricao: 'Total por mês somando as empresas, com linha de total.', rodar: async (f) => {
    const l = await faturamentoMensal(f)
    const linhas = agrupar(l, (x) => `${x.ano}-${String(x.mes).padStart(2, '0')}`, (x) => x.valor)
    const tot = somar(linhas.map(([, v]) => v.toString()))
    return [...linhas.map(([c, v]) => ({ Competência: competencia(c + '-01'), 'Faturamento (R$)': R(v.toString()) })), { Competência: 'TOTAL', 'Faturamento (R$)': R(tot.toString()) }]
  } },
  { id: 'limite', titulo: 'Acompanhamento do limite', descricao: 'Situação por empresa no ano da data final do filtro (limite configurado por você).', rodar: async (f) => {
    const ano = Number(f.ate.slice(0, 4))
    const l = ok(await supabase.rpc('limite_situacao', { p_empresa: f.empresaId, p_ano: ano })) as LimiteSituacao[]
    return l.map((x) => ({ Empresa: f.nomeEmpresa(x.empresa_id), Ano: x.ano, 'Limite (R$)': x.limite, 'Acumulado (R$)': x.acumulado, 'Saldo (R$)': x.saldo, 'Utilizado (%)': x.percentual, Situação: x.nivel, 'Projeção anual — estimativa (R$)': x.projecao_anual }))
  } },
]

export default function Relatorios() {
  const { empresaId, nomeEmpresa } = useEmpresa()
  const clientes = useClientes()
  const categorias = useCategorias()
  const ano = new Date().getFullYear()
  const [id, setId] = useState(RELATORIOS[0].id)
  const [de, setDe] = useState(`${ano}-01-01`)
  const [ate, setAte] = useState(`${ano}-12-31`)
  const [clienteId, setClienteId] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [linhas, setLinhas] = useState<LinhaExport[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState<unknown>(null)
  const rel = RELATORIOS.find((r) => r.id === id)!

  async function gerar() {
    setBusy(true); setErro(null)
    try { setLinhas(await rel.rodar({ de, ate, empresaId, clienteId, categoriaId, nomeEmpresa })) } catch (e) { setErro(new Error(mensagemErro(e))); setLinhas(null) } finally { setBusy(false) }
  }
  const nomeArq = `${rel.id}-${hoje()}`
  const colunas = linhas?.length ? Object.keys(linhas[0]) : []

  return (
    <>
      <PageHeader titulo="Relatórios" subtitulo="Respeitam a empresa selecionada no topo e usam os mesmos critérios do dashboard." />
      <div className="card mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Campo rotulo="Relatório" className="sm:col-span-3">
          <select className="input" value={id} onChange={(e) => { setId(e.target.value); setLinhas(null) }}>{RELATORIOS.map((r) => <option key={r.id} value={r.id}>{r.titulo}</option>)}</select>
          <span className="mt-1 block text-xs text-sub">{rel.descricao}</span>
        </Campo>
        <Campo rotulo="Período — de"><input className="input" type="date" value={de} onChange={(e) => setDe(e.target.value)} /></Campo>
        <Campo rotulo="Período — até"><input className="input" type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></Campo>
        <Campo rotulo="Cliente"><select className="input" value={clienteId} onChange={(e) => setClienteId(e.target.value)}><option value="">Todos</option>{(clientes.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.razao_social}</option>)}</select></Campo>
        <Campo rotulo="Categoria"><select className="input" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}><option value="">Todas</option>{(categorias.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Campo>
        <div className="flex items-end gap-2 sm:col-span-2">
          <button className="btn-primary" onClick={gerar} disabled={busy}>{busy ? 'Gerando…' : 'Gerar relatório'}</button>
          <button className="btn-ghost" disabled={!linhas?.length} onClick={() => linhas && exportarCsv(nomeArq, linhas)}>Exportar CSV</button>
          <button className="btn-ghost" disabled={!linhas?.length} onClick={() => linhas && exportarXlsx(nomeArq, linhas)}>Exportar Excel</button>
        </div>
      </div>
      <p className="mb-2 text-xs text-sub">Empresa: {empresaId ? nomeEmpresa(empresaId) : 'todas'}. Nem todo filtro se aplica a todos os relatórios (cliente e categoria valem onde o dado existe).</p>
      {busy && <Carregando />}
      {erro != null && <ErroBox erro={erro} />}
      {linhas && (
        <Tabela linhas={linhas.map((l, i) => ({ ...l, __i: i }))} chave={(l) => String(l.__i)} vazio="Nenhum registro para os filtros selecionados."
          colunas={colunas.map((c) => ({ titulo: c, alinhar: c.includes('(R$)') || c.includes('(%)') ? ('right' as const) : undefined, render: (l: LinhaExport) => (c.includes('(R$)') ? moeda(l[c] as number) : String(l[c] ?? '—')) }))} />
      )}
    </>
  )
}
