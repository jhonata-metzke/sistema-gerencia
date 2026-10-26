import { MESES } from '@/lib/datas'

export function anosDisponiveis(): number[] {
  const a = new Date().getFullYear()
  return [a - 3, a - 2, a - 1, a, a + 1]
}

export function SeletorAno({ valor, onChange }: { valor: number; onChange: (a: number) => void }) {
  return (
    <select className="input w-auto" value={valor} onChange={(e) => onChange(Number(e.target.value))} aria-label="Ano">
      {anosDisponiveis().map((a) => <option key={a} value={a}>{a}</option>)}
    </select>
  )
}

export function SeletorMes({ valor, onChange, todos }: { valor: number; onChange: (m: number) => void; todos?: boolean }) {
  return (
    <select className="input w-auto" value={valor} onChange={(e) => onChange(Number(e.target.value))} aria-label="Mês">
      {todos && <option value={0}>Todos os meses</option>}
      {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
    </select>
  )
}
