export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

// Datas do banco chegam como 'AAAA-MM-DD'; formata sem passar por Date (evita deslocar o dia por fuso).
export function data(v: string | null | undefined): string {
  if (!v) return '—'
  const [a, m, d] = v.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export function competencia(v: string | null | undefined): string {
  if (!v) return '—'
  const [a, m] = v.split('-')
  return `${m}/${a}`
}

export function primeiroDia(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}-01`
}

export function hoje(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
