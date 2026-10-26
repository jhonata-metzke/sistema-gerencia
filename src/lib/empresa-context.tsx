import { createContext, useContext, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Empresa } from '@/lib/types'
import { useAuth } from '@/auth/AuthProvider'

interface Ctx {
  empresas: Empresa[]
  carregando: boolean
  /** null = todas as empresas (visão consolidada) */
  empresaId: string | null
  setEmpresaId: (id: string | null) => void
  nomeEmpresa: (id: string) => string
}
const EmpresaCtx = createContext<Ctx>(null as never)
export const useEmpresa = () => useContext(EmpresaCtx)

export function EmpresaProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [empresaId, setId] = useState<string | null>(() => {
    try { return localStorage.getItem('empresaId') || null } catch { return null }
  })
  const q = useQuery({
    queryKey: ['empresas'],
    enabled: Boolean(session),
    queryFn: async () => {
      const { data, error } = await supabase.from('empresas').select('*').order('nome_fantasia', { nullsFirst: false }).order('razao_social')
      if (error) throw error
      return data as Empresa[]
    },
  })
  const empresas = q.data ?? []
  const valido = empresaId && empresas.some((e) => e.id === empresaId) ? empresaId : null

  function setEmpresaId(id: string | null) {
    setId(id)
    try { id ? localStorage.setItem('empresaId', id) : localStorage.removeItem('empresaId') } catch { /* sem storage */ }
  }
  const nomeEmpresa = (id: string) => {
    const e = empresas.find((x) => x.id === id)
    return e ? (e.nome_fantasia || e.razao_social) : '—'
  }
  return <EmpresaCtx.Provider value={{ empresas, carregando: q.isLoading, empresaId: valido, setEmpresaId, nomeEmpresa }}>{children}</EmpresaCtx.Provider>
}
