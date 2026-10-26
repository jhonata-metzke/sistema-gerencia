import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, configurado } from '@/lib/supabase'
import { mensagemErro } from '@/components/ui'

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [criar, setCriar] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [busy, setBusy] = useState(false)

  const semOwner = useQuery({
    queryKey: ['tenho_owner'],
    enabled: configurado,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('tenho_owner')
      if (error) throw error
      return data === false
    },
  })

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro(''); setAviso(''); setBusy(true)
    try {
      if (criar) {
        const { data, error } = await supabase.auth.signUp({ email, password: senha })
        if (error) throw error
        if (!data.session) setAviso('Conta criada. Confirme o e-mail e depois entre.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
        if (error) throw error
      }
    } catch (err) {
      setErro(mensagemErro(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={enviar} className="card w-full max-w-sm space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Gestão Comercial e Faturamento</h1>
          <p className="text-sm text-sub">{criar ? 'Criar a conta do proprietário' : 'Entre para continuar'}</p>
        </div>
        {!configurado && (
          <p className="rounded-md border border-warn p-2 text-xs text-warn">
            Backend não configurado: defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.
          </p>
        )}
        <label className="block text-sm">E-mail
          <input className="input mt-1" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block text-sm">Senha
          <input className="input mt-1" type="password" autoComplete={criar ? 'new-password' : 'current-password'} minLength={8} required value={senha} onChange={(e) => setSenha(e.target.value)} />
        </label>
        {erro && <p role="alert" className="text-sm text-bad">{erro}</p>}
        {aviso && <p className="text-sm text-ok">{aviso}</p>}
        <button className="btn-primary w-full" disabled={busy}>{criar ? 'Criar conta' : 'Entrar'}</button>
        {semOwner.data && (
          <button type="button" className="w-full text-xs text-brand underline" onClick={() => setCriar(!criar)}>
            {criar ? 'Já tenho conta' : 'Primeiro acesso: criar conta do proprietário'}
          </button>
        )}
      </form>
    </main>
  )
}
