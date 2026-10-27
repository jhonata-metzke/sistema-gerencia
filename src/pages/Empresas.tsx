import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { ok } from '@/lib/dados'
import { useEmpresa } from '@/lib/empresa-context'
import { useAuth } from '@/auth/AuthProvider'
import { cnpjValido, formatarCnpj } from '@/lib/cnpj'
import { moeda } from '@/lib/money'
import { MESES } from '@/lib/datas'
import type { Empresa, FaturamentoMensal, LimiteSituacao } from '@/lib/types'
import { Badge, Campo, Detalhe, Drawer, Modal, PageHeader, Secao, StatCard, Tabela, mensagemErro, useToast } from '@/components/ui'
import { SeletorAno } from '@/components/FiltroPeriodo'
import { somar } from '@/lib/money'
import { percentual } from '@/lib/money'

const REGIMES = ['nao_informado', 'MEI', 'Simples Nacional', 'Lucro Presumido', 'Lucro Real']
const ROTULO_REGIME: Record<string, string> = { nao_informado: 'Não informado' }

export default function Empresas() {
  const { empresas } = useEmpresa()
  const { isOwner } = useAuth()
  const [editando, setEditando] = useState<Partial<Empresa> | null>(null)
  const [aberta, setAberta] = useState<Empresa | null>(null)

  return (
    <>
      <PageHeader titulo="Empresas" subtitulo="Os CNPJs administrados. Cada receita permanece vinculada à empresa de origem."
        acoes={isOwner && <button className="btn-primary" onClick={() => setEditando({ regime_tributario: 'nao_informado', situacao: 'ativa' })}>Nova empresa</button>} />
      <Tabela
        linhas={empresas} chave={(e) => e.id} aoClicar={setAberta}
        vazio={isOwner ? 'Nenhuma empresa cadastrada. Use "Nova empresa".' : 'Nenhuma empresa liberada para o seu usuário.'}
        colunas={[
          { titulo: 'Razão social', render: (e) => <><div className="font-medium">{e.razao_social}</div>{e.nome_fantasia && <div className="text-xs text-sub">{e.nome_fantasia}</div>}</> },
          { titulo: 'CNPJ', render: (e) => formatarCnpj(e.cnpj) },
          { titulo: 'Regime', render: (e) => ROTULO_REGIME[e.regime_tributario] ?? e.regime_tributario },
          { titulo: 'Situação', render: (e) => <Badge valor={e.situacao === 'ativa' ? 'ativo' : 'inativo'} /> },
        ]}
      />
      {aberta && <EmpresaDetalhe empresa={aberta} onClose={() => setAberta(null)} onEditar={isOwner ? () => { setEditando(aberta); setAberta(null) } : undefined} />}
      {editando && <EmpresaForm inicial={editando} onClose={() => setEditando(null)} />}
    </>
  )
}

function EmpresaDetalhe({ empresa, onClose, onEditar }: { empresa: Empresa; onClose: () => void; onEditar?: (() => void) | undefined }) {
  const [ano, setAno] = useState(new Date().getFullYear())
  const fat = useQuery({
    queryKey: ['fat-empresa', empresa.id, ano],
    queryFn: async () => ok(await supabase.from('v_faturamento_mensal').select('*').eq('empresa_id', empresa.id).eq('ano', ano)) as FaturamentoMensal[],
  })
  const lim = useQuery({
    queryKey: ['limite', empresa.id, ano],
    queryFn: async () => ok(await supabase.rpc('limite_situacao', { p_empresa: empresa.id, p_ano: ano })) as LimiteSituacao[],
  })
  const porMes = MESES.map((_, i) => somar((fat.data ?? []).filter((f) => f.mes === i + 1).map((f) => f.valor)))
  const total = somar(porMes.map((d) => d.toString()))
  const l = lim.data?.[0]
  return (
    <Drawer titulo={empresa.nome_fantasia || empresa.razao_social} onClose={onClose}>
      <Secao titulo="Cadastro" acoes={onEditar && <button className="btn-ghost" onClick={onEditar}>Editar</button>}>
        <dl className="card grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Detalhe rotulo="Razão social">{empresa.razao_social}</Detalhe>
          <Detalhe rotulo="CNPJ">{formatarCnpj(empresa.cnpj)}</Detalhe>
          <Detalhe rotulo="Regime tributário">{ROTULO_REGIME[empresa.regime_tributario] ?? empresa.regime_tributario}</Detalhe>
          <Detalhe rotulo="Início das atividades">{empresa.inicio_atividades ? empresa.inicio_atividades.split('-').reverse().join('/') : '—'}</Detalhe>
        </dl>
      </Secao>
      <Secao titulo="Indicadores anuais" acoes={<SeletorAno valor={ano} onChange={setAno} />}>
        <div className="grid grid-cols-2 gap-3">
          <StatCard titulo="Faturamento no ano" valor={moeda(total)} />
          <StatCard titulo="Limite utilizado" valor={l?.percentual != null ? percentual(l.percentual) : '—'}
            detalhe={l?.limite != null ? `de ${moeda(l.limite)}` : 'Sem limite configurado para este ano'} />
        </div>
      </Secao>
      <Secao titulo="Indicadores mensais">
        <Tabela linhas={MESES.map((m, i) => ({ m, v: porMes[i] }))} chave={(r) => r.m}
          colunas={[{ titulo: 'Mês', render: (r) => r.m }, { titulo: 'Faturamento', alinhar: 'right', render: (r) => moeda(r.v) }]} />
      </Secao>
      <p className="text-xs text-sub">Limite e percentuais de alerta são configurados em Limite MEI.</p>
    </Drawer>
  )
}

function EmpresaForm({ inicial, onClose }: { inicial: Partial<Empresa>; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [f, setF] = useState({
    razao_social: inicial.razao_social ?? '', nome_fantasia: inicial.nome_fantasia ?? '', cnpj: inicial.cnpj ? formatarCnpj(inicial.cnpj) : '',
    regime_tributario: inicial.regime_tributario ?? 'nao_informado', inicio_atividades: inicial.inicio_atividades ?? '', situacao: inicial.situacao ?? 'ativa',
  })
  const [erro, setErro] = useState('')
  const salvar = useMutation({
    mutationFn: async () => {
      const dados = { ...f, nome_fantasia: f.nome_fantasia || null, inicio_atividades: f.inicio_atividades || null }
      const r = inicial.id ? await supabase.from('empresas').update(dados).eq('id', inicial.id) : await supabase.from('empresas').insert(dados)
      if (r.error) throw r.error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['empresas'] }); toast('ok', 'Empresa salva.'); onClose() },
    onError: (e) => setErro(mensagemErro(e)),
  })
  function enviar(e: FormEvent) {
    e.preventDefault()
    if (!cnpjValido(f.cnpj)) return setErro('CNPJ inválido.')
    setErro(''); salvar.mutate()
  }
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  return (
    <Modal titulo={inicial.id ? 'Editar empresa' : 'Nova empresa'} onClose={onClose}>
      <form onSubmit={enviar} className="space-y-3">
        <Campo rotulo="Razão social *"><input className="input" required value={f.razao_social} onChange={set('razao_social')} /></Campo>
        <Campo rotulo="Nome fantasia"><input className="input" value={f.nome_fantasia} onChange={set('nome_fantasia')} /></Campo>
        <Campo rotulo="CNPJ *"><input className="input" required value={f.cnpj} onChange={set('cnpj')} placeholder="00.000.000/0000-00" /></Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Regime tributário" dica="Informe o regime real de cada empresa; nada é presumido.">
            <select className="input" value={f.regime_tributario} onChange={set('regime_tributario')}>
              {REGIMES.map((r) => <option key={r} value={r}>{ROTULO_REGIME[r] ?? r}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Início das atividades"><input className="input" type="date" value={f.inicio_atividades} onChange={set('inicio_atividades')} /></Campo>
        </div>
        <Campo rotulo="Situação">
          <select className="input" value={f.situacao} onChange={set('situacao')}><option value="ativa">Ativa</option><option value="inativa">Inativa</option></select>
        </Campo>
        {erro && <p role="alert" className="text-sm text-bad">{erro}</p>}
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={salvar.isPending}>Salvar</button></div>
      </form>
    </Modal>
  )
}
