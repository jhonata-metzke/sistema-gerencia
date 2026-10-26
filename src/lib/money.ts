import Decimal from 'decimal.js'

// Cálculos monetários sempre com Decimal; nunca somar números de ponto flutuante.
export const dec = (v: number | string | Decimal | null | undefined) => new Decimal(v ?? 0)

export function somar(valores: Array<number | string | Decimal | null | undefined>): Decimal {
  return valores.reduce<Decimal>((acc, v) => acc.plus(dec(v)), new Decimal(0))
}

export function moeda(v: number | string | Decimal | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(new Decimal(v).toDecimalPlaces(2).toNumber())
}

// Aceita "1.234,56", "1234,56" ou "1234.56"; devolve número com 2 casas ou null se inválido.
export function lerMoeda(texto: string): number | null {
  let t = (texto ?? '').trim().replace(/[R$\s]/g, '')
  if (!t) return null
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null
  return new Decimal(t).toDecimalPlaces(2).toNumber()
}

export function percentual(v: number | string | Decimal | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return `${new Decimal(v).toDecimalPlaces(2).toString().replace('.', ',')}%`
}
