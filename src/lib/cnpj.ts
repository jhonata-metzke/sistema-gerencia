// Validação de CNPJ numérico e alfanumérico (valor do caractere = código ASCII - 48).
const PESOS1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
const PESOS2 = [6, ...PESOS1]

export function normalizarCnpj(valor: string): string {
  return (valor ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase()
}

function digito(base: string, pesos: number[]): number {
  const soma = [...base].reduce((acc, c, i) => acc + (c.charCodeAt(0) - 48) * pesos[i], 0)
  const resto = soma % 11
  return resto < 2 ? 0 : 11 - resto
}

export function cnpjValido(valor: string): boolean {
  const c = normalizarCnpj(valor)
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(c)) return false
  if (/^(.)\1{13}$/.test(c)) return false
  const d1 = digito(c.slice(0, 12), PESOS1)
  const d2 = digito(c.slice(0, 12) + d1, PESOS2)
  return c.slice(12) === `${d1}${d2}`
}

export function formatarCnpj(valor: string | null | undefined): string {
  const c = normalizarCnpj(valor ?? '')
  if (c.length !== 14) return valor ?? ''
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`
}
