import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

// ---------- Toasts ----------
interface Toast { id: number; tipo: 'ok' | 'erro'; texto: string }
const ToastCtx = createContext<(tipo: Toast['tipo'], texto: string) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((tipo: Toast['tipo'], texto: string) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, tipo, texto }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tipo === 'erro' ? 7000 : 3500)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex max-w-sm flex-col gap-2" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`rounded-md border px-4 py-3 text-sm shadow-lg bg-surface ${t.tipo === 'ok' ? 'border-ok text-ok' : 'border-bad text-bad'}`}>
            {t.texto}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function mensagemErro(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e)
  if (msg.includes('duplicate key') && msg.includes('cnpj')) return 'Já existe um cadastro com este CNPJ.'
  if (msg.includes('row-level security')) return 'Você não tem permissão para esta operação.'
  if (msg.includes('cnpj_check')) return 'CNPJ inválido.'
  return msg
}

// ---------- Layout de conteúdo ----------
export function PageHeader({ titulo, subtitulo, acoes }: { titulo: string; subtitulo?: string; acoes?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">{titulo}</h1>
        {subtitulo && <p className="text-sm text-sub">{subtitulo}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{acoes}</div>
    </div>
  )
}

export function StatCard({ titulo, valor, detalhe, hint, tom }: { titulo: string; valor: string; detalhe?: string; hint?: string; tom?: 'ok' | 'warn' | 'bad' }) {
  const cor = tom === 'bad' ? 'text-bad' : tom === 'warn' ? 'text-warn' : tom === 'ok' ? 'text-ok' : ''
  return (
    <div className="card" title={hint}>
      <div className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-sub">
        {titulo}
        {hint && <span className="cursor-help rounded-full border border-line px-1 text-[10px] normal-case" aria-label={hint}>?</span>}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${cor}`}>{valor}</div>
      {detalhe && <div className="mt-1 text-xs text-sub">{detalhe}</div>}
    </div>
  )
}

export type Icone = 'dinheiro' | 'grafico' | 'contrato' | 'pacote' | 'carrinho'
const ICONES: Record<Icone, string> = {
  dinheiro: 'M12 2v20M17 6.5C17 4.6 14.8 3.5 12 3.5S7 4.6 7 6.5 9.2 9.5 12 10.5s5 2 5 4-2.2 3-5 3-5-1.1-5-3',
  grafico: 'M3 3v18h18M7 15l4-4 3 3 5-6',
  contrato: 'M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6',
  pacote: 'M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8',
  carrinho: 'M3 4h2l2.4 11h10l2-8H6.5M9 20h.01M17 20h.01',
}

/** Cartão de indicador com ícone e variação em relação ao período anterior (null = sem base de comparação). */
export function KpiCard({ titulo, valor, icone, variacao, detalhe, hint }: { titulo: string; valor: string; icone: Icone; variacao?: number | null; detalhe?: string; hint?: string }) {
  const tem = variacao !== undefined && variacao !== null && Number.isFinite(variacao)
  const cor = !tem || variacao === 0 ? 'bg-muted text-sub' : (variacao as number) > 0 ? 'bg-ok/15 text-ok' : 'bg-bad/15 text-bad'
  const txt = tem ? `${(variacao as number) > 0 ? '+' : ''}${Math.round(variacao as number)}%` : '—'
  return (
    <div className="card" title={hint}>
      <div className="flex items-start justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand/10 text-brand">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONES[icone]} /></svg>
        </span>
        {variacao !== undefined && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cor}`} title="Variação em relação ao mês anterior">{txt}</span>}
      </div>
      <div className="mt-3 text-sm text-sub">{titulo}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{valor}</div>
      {detalhe && <div className="mt-1 text-xs text-sub">{detalhe}</div>}
    </div>
  )
}

export function MesesPills({ valor, onChange, nomes }: { valor: number; onChange: (m: number) => void; nomes: string[] }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por mês">
      {nomes.map((n, i) => (
        <button key={n} type="button" aria-pressed={valor === i + 1} onClick={() => onChange(i + 1)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium ${valor === i + 1 ? 'bg-ok text-white' : 'bg-muted text-fg hover:bg-line'}`}>{n}</button>
      ))}
    </div>
  )
}

const BADGE: Record<string, string> = {
  paga: 'bg-ok/15 text-ok', recebida: 'bg-ok/15 text-ok', ativo: 'bg-ok/15 text-ok', ok: 'bg-ok/15 text-ok',
  vencida: 'bg-bad/15 text-bad', cancelada: 'bg-bad/15 text-bad', ultrapassado: 'bg-bad/15 text-bad', critico: 'bg-bad/15 text-bad', encerrado: 'bg-muted text-sub', inativo: 'bg-muted text-sub',
  parcialmente_paga: 'bg-warn/15 text-warn', atencao: 'bg-warn/15 text-warn', pendente: 'bg-warn/15 text-warn', suspenso: 'bg-warn/15 text-warn',
  prevista: 'bg-muted text-sub', registrada: 'bg-muted text-sub', faturada: 'bg-brand/15 text-brand', sem_parametro: 'bg-muted text-sub',
}
const ROTULO: Record<string, string> = {
  parcialmente_paga: 'Parcialmente paga', sem_parametro: 'Sem parâmetro', atencao: 'Atenção', critico: 'Crítico', ultrapassado: 'Ultrapassado',
}
export function Badge({ valor }: { valor: string }) {
  const texto = ROTULO[valor] ?? valor.charAt(0).toUpperCase() + valor.slice(1)
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[valor] ?? 'bg-muted text-sub'}`}>{texto}</span>
}

export function Carregando() {
  return <div className="p-6 text-sm text-sub">Carregando…</div>
}
export function Vazio({ texto }: { texto: string }) {
  return <div className="p-6 text-center text-sm text-sub">{texto}</div>
}
export function ErroBox({ erro }: { erro: unknown }) {
  return <div className="rounded-md border border-bad bg-bad/10 p-3 text-sm text-bad">{mensagemErro(erro)}</div>
}

// ---------- Tabela ----------
export interface Coluna<T> { titulo: string; render: (l: T) => ReactNode; alinhar?: 'right'; className?: string }
export function Tabela<T>({ colunas, linhas, chave, aoClicar, vazio = 'Nenhum registro encontrado.' }: {
  colunas: Coluna<T>[]; linhas: T[]; chave: (l: T) => string; aoClicar?: (l: T) => void; vazio?: string
}) {
  if (!linhas.length) return <div className="card"><Vazio texto={vazio} /></div>
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full min-w-[520px]">
        <thead className="border-b border-line bg-muted/60">
          <tr>{colunas.map((c) => <th key={c.titulo} className={`th ${c.alinhar === 'right' ? 'text-right' : ''}`}>{c.titulo}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">
          {linhas.map((l) => (
            <tr key={chave(l)} onClick={aoClicar ? () => aoClicar(l) : undefined}
              className={aoClicar ? 'cursor-pointer hover:bg-muted/50' : ''}>
              {colunas.map((c) => <td key={c.titulo} className={`td ${c.alinhar === 'right' ? 'text-right tabular-nums' : ''} ${c.className ?? ''}`}>{c.render(l)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------- Modal e painel lateral ----------
function useEsc(onClose: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
}

export function Modal({ titulo, onClose, children, largo }: { titulo: string; onClose: () => void; children: ReactNode; largo?: boolean }) {
  useEsc(onClose)
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={titulo}
        className={`max-h-[92vh] w-full overflow-y-auto rounded-t-xl bg-surface p-5 shadow-xl sm:rounded-xl ${largo ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{titulo}</h2>
          <button className="btn-ghost px-2 py-1" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Drawer({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: ReactNode }) {
  useEsc(onClose)
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside role="dialog" aria-label={titulo} className="h-full w-full overflow-y-auto bg-bg p-5 shadow-xl sm:max-w-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">{titulo}</h2>
          <button className="btn-ghost px-2 py-1" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
        {children}
      </aside>
    </div>
  )
}

export function Secao({ titulo, children, acoes }: { titulo: string; children: ReactNode; acoes?: ReactNode }) {
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-sub">{titulo}</h3>
        {acoes}
      </div>
      {children}
    </section>
  )
}

export function Confirmar({ titulo, texto, rotulo = 'Confirmar', perigo, onConfirm, onClose }: {
  titulo: string; texto: string; rotulo?: string; perigo?: boolean; onConfirm: () => void | Promise<void>; onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  return (
    <Modal titulo={titulo} onClose={onClose}>
      <p className="mb-4 text-sm">{texto}</p>
      <div className="flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>Voltar</button>
        <button className={perigo ? 'btn-danger' : 'btn-primary'} disabled={busy}
          onClick={async () => { setBusy(true); try { await onConfirm() } finally { setBusy(false) } }}>{rotulo}</button>
      </div>
    </Modal>
  )
}

// ---------- Formulários ----------
export function Campo({ rotulo, children, dica, className }: { rotulo: string; children: ReactNode; dica?: string; className?: string }) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="mb-1 block text-xs font-medium text-sub">{rotulo}</span>
      {children}
      {dica && <span className="mt-1 block text-xs text-sub">{dica}</span>}
    </label>
  )
}

export function Detalhe({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-sub">{rotulo}</dt>
      <dd className="text-sm">{children ?? '—'}</dd>
    </div>
  )
}

export function Busca({ valor, onChange, placeholder = 'Pesquisar…' }: { valor: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input className="input sm:max-w-xs" type="search" value={valor} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-label={placeholder} />
}
