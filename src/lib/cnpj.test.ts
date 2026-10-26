import { describe, expect, it } from 'vitest'
import { cnpjValido, formatarCnpj, normalizarCnpj } from './cnpj'
import { lerMoeda, moeda, somar } from './money'
import { data, competencia } from './datas'

describe('cnpj', () => {
  it('aceita CNPJs numéricos válidos, com ou sem máscara', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe(true)
    expect(cnpjValido('11444777000161')).toBe(true)
  })
  it('aceita CNPJ alfanumérico válido', () => {
    expect(cnpjValido('12ABC345000188')).toBe(true)
    expect(cnpjValido('12abc345/0001-88')).toBe(true)
  })
  it('rejeita dígito errado, repetidos e tamanho inválido', () => {
    expect(cnpjValido('11222333000182')).toBe(false)
    expect(cnpjValido('11111111111111')).toBe(false)
    expect(cnpjValido('123')).toBe(false)
  })
  it('normaliza e formata', () => {
    expect(normalizarCnpj('11.222.333/0001-81')).toBe('11222333000181')
    expect(formatarCnpj('11222333000181')).toBe('11.222.333/0001-81')
  })
})

describe('dinheiro', () => {
  it('soma sem erro de ponto flutuante', () => {
    expect(somar([0.1, 0.2]).toString()).toBe('0.3')
    expect(somar([33.33, 33.33, 33.33]).toString()).toBe('99.99')
  })
  it('lê valores em formato brasileiro', () => {
    expect(lerMoeda('1.234,56')).toBe(1234.56)
    expect(lerMoeda('R$ 150,00')).toBe(150)
    expect(lerMoeda('abc')).toBeNull()
  })
  it('formata em reais', () => {
    expect(moeda(1234.5).replace(/\s/g, ' ')).toBe('R$ 1.234,50')
  })
})

describe('datas', () => {
  it('formata sem deslocar o dia', () => {
    expect(data('2026-03-01')).toBe('01/03/2026')
    expect(competencia('2026-03-01')).toBe('03/2026')
  })
})
