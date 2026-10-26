import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Papel } from '@/lib/types'

interface PapelUsuario { id: string; empresa_id: string | null; papel: Papel }
interface AuthState {
  session: Session | null
  carregando: boolean
  papeis: PapelUsuario[]
  carregandoPapeis: boolean
  isOwner: boolean
  podeEditar: boolean
  podeGerir: boolean
  sair: () => Promise<void>
}
const Ctx = createContext<AuthState>(null as never)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [carregando, setCarregando] = useState(true)
  const qc = useQueryClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setCarregando(false) })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); qc.clear() })
    return () => data.subscription.unsubscribe()
  }, [qc])

  const papeisQ = useQuery({
    queryKey: ['papeis', session?.user.id],
    enabled: Boolean(session),
    queryFn: async () => {
      let { data, error } = await supabase.from('papeis_usuario').select('id, empresa_id, papel').eq('user_id', session!.user.id)
      if (error) throw error
      if (!data?.length) {
        // Primeiro acesso: o primeiro usuário se torna proprietário (a função recusa se já houver um).
        const r = await supabase.rpc('reivindicar_owner')
        if (!r.error && r.data === true) {
          ;({ data, error } = await supabase.from('papeis_usuario').select('id, empresa_id, papel').eq('user_id', session!.user.id))
          if (error) throw error
        }
      }
      return (data ?? []) as PapelUsuario[]
    },
  })

  const papeis = papeisQ.data ?? []
  const isOwner = papeis.some((p) => p.papel === 'owner')
  const podeEditar = isOwner || papeis.some((p) => p.papel === 'gestor' || p.papel === 'operador')
  const podeGerir = isOwner || papeis.some((p) => p.papel === 'gestor')

  return (
    <Ctx.Provider value={{
      session, carregando, papeis, carregandoPapeis: papeisQ.isLoading, isOwner, podeEditar, podeGerir,
      sair: async () => { await supabase.auth.signOut() },
    }}>
      {children}
    </Ctx.Provider>
  )
}
