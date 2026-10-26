import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { useEmpresa } from '@/lib/empresa-context'

const MENU = [
  ['/', 'Dashboard Master'], ['/empresas', 'Empresas'], ['/clientes', 'Clientes'], ['/mensalidades', 'Mensalidades'],
  ['/cobrancas', 'Cobranças'], ['/adicionais', 'Adicionais'], ['/vendas', 'Vendas'], ['/faturamento', 'Faturamento'],
  ['/limite-mei', 'Limite MEI'], ['/relatorios', 'Relatórios'], ['/configuracoes', 'Configurações'],
] as const

export default function Layout() {
  const [aberto, setAberto] = useState(false)
  const { session, sair } = useAuth()
  const { empresas, empresaId, setEmpresaId } = useEmpresa()

  return (
    <div className="min-h-screen lg:flex">
      <aside className={`${aberto ? 'block' : 'hidden'} sidebar-grad fixed inset-0 z-30 p-3 lg:static lg:block lg:w-60 lg:shrink-0`}>
        <div className="mb-3 flex items-center justify-between px-2">
          <span className="text-lg font-bold">Gestão Comercial</span>
          <button className="rounded-md border border-white/30 px-2 py-1 text-sm lg:hidden" onClick={() => setAberto(false)} aria-label="Fechar menu">✕</button>
        </div>
        <nav className="space-y-0.5" aria-label="Menu principal">
          {MENU.map(([to, rotulo]) => (
            <NavLink key={to} to={to} end={to === '/'} onClick={() => setAberto(false)}
              className={({ isActive }) => `block rounded-md px-3 py-2 text-sm ${isActive ? 'bg-black/25 font-medium' : 'text-white/85 hover:bg-white/10'}`}>
              {rotulo}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-2">
          <button className="btn-ghost px-2 py-1 lg:hidden" onClick={() => setAberto(true)} aria-label="Abrir menu">☰</button>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-sub">Empresa</span>
            <select className="input w-auto" value={empresaId ?? ''} onChange={(e) => setEmpresaId(e.target.value || null)}>
              <option value="">Todas (consolidado)</option>
              {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome_fantasia || e.razao_social}</option>)}
            </select>
          </label>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-sub sm:inline">{session?.user.email}</span>
            <button className="btn-ghost" onClick={sair}>Sair</button>
          </div>
        </header>
        <main className="p-4 lg:p-6"><Outlet /></main>
      </div>
    </div>
  )
}
