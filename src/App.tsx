import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider'
import Login from './auth/Login'
import Layout from './components/Layout'
import { Carregando } from './components/ui'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Empresas = lazy(() => import('./pages/Empresas'))
const Clientes = lazy(() => import('./pages/Clientes'))
const Mensalidades = lazy(() => import('./pages/Mensalidades'))
const Cobrancas = lazy(() => import('./pages/Cobrancas'))
const Adicionais = lazy(() => import('./pages/Adicionais'))
const Vendas = lazy(() => import('./pages/Vendas'))
const Faturamento = lazy(() => import('./pages/Faturamento'))
const LimiteMei = lazy(() => import('./pages/LimiteMei'))
const Relatorios = lazy(() => import('./pages/Relatorios'))
const Configuracoes = lazy(() => import('./pages/Configuracoes'))

export default function App() {
  const { session, carregando, papeis, carregandoPapeis, sair } = useAuth()
  if (carregando) return <Carregando />
  if (!session) return <Login />
  if (carregandoPapeis) return <Carregando />
  if (!papeis.length) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <div className="card max-w-sm space-y-3 text-center">
          <h1 className="text-lg font-semibold">Acesso pendente</h1>
          <p className="text-sm text-sub">Sua conta ainda não tem permissão em nenhuma empresa. Peça ao proprietário para liberar o acesso.</p>
          <button className="btn-ghost" onClick={sair}>Sair</button>
        </div>
      </main>
    )
  }
  return (
    <Suspense fallback={<Carregando />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="empresas" element={<Empresas />} />
          <Route path="clientes" element={<Clientes />} />
          <Route path="mensalidades" element={<Mensalidades />} />
          <Route path="cobrancas" element={<Cobrancas />} />
          <Route path="adicionais" element={<Adicionais />} />
          <Route path="vendas" element={<Vendas />} />
          <Route path="faturamento" element={<Faturamento />} />
          <Route path="limite-mei" element={<LimiteMei />} />
          <Route path="relatorios" element={<Relatorios />} />
          <Route path="configuracoes" element={<Configuracoes />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
