import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import { ok } from './dados'
import { somar } from './money'
import type { Cancelamento, FaturamentoMensal, IndicadoresCobranca, LimiteSituacao, ResumoContratos } from './types'

export const TIPOS = { mensalidade: 'Mensalidades', adicional: 'Adicionais', venda: 'Vendas de mercadorias' } as const
export const COR_TIPO = { mensalidade: '#2563eb', adicional: '#d97706', venda: '#059669' } as const

export function useFaturamentoAno(empresaId: string | null, ano: number) {
  return useQuery({
    queryKey: ['fat-ano', empresaId, ano],
    queryFn: async () => {
      let r = supabase.from('v_faturamento_mensal').select('*').eq('ano', ano)
      if (empresaId) r = r.eq('empresa_id', empresaId)
      return ok(await r) as FaturamentoMensal[]
    },
  })
}

export function useCancelamentosAno(empresaId: string | null, ano: number) {
  return useQuery({
    queryKey: ['cancel-ano', empresaId, ano],
    queryFn: async () => {
      let r = supabase.from('v_cancelamentos').select('*').gte('competencia', `${ano}-01-01`).lte('competencia', `${ano}-12-01`)
      if (empresaId) r = r.eq('empresa_id', empresaId)
      return ok(await r) as Cancelamento[]
    },
  })
}

export function useLimites(empresaId: string | null, ano: number) {
  return useQuery({
    queryKey: ['limites', empresaId, ano],
    queryFn: async () => ok(await supabase.rpc('limite_situacao', { p_empresa: empresaId, p_ano: ano })) as LimiteSituacao[],
  })
}

export function useIndicadoresCobranca(empresaId: string | null, inicio: string, fim: string) {
  return useQuery({
    queryKey: ['ind-cobranca', empresaId, inicio, fim],
    queryFn: async () => ok(await supabase.rpc('indicadores_cobranca', { p_empresa: empresaId, p_inicio: inicio, p_fim: fim })) as IndicadoresCobranca[],
  })
}

export function useResumoContratos(empresaId: string | null) {
  return useQuery({
    queryKey: ['resumo-contratos', empresaId],
    queryFn: async () => ok(await supabase.rpc('resumo_contratos', { p_empresa: empresaId })) as ResumoContratos[],
  })
}

export interface Filtro { mes?: number | undefined; mesAte?: number | undefined; categoriaId?: string | undefined; tipo?: string | undefined; empresaId?: string | undefined }

export function filtrar(linhas: FaturamentoMensal[], f: Filtro) {
  return linhas.filter((l) =>
    (f.mes === undefined || f.mes === 0 || l.mes === f.mes) &&
    (f.mesAte === undefined || l.mes <= f.mesAte) &&
    (!f.categoriaId || l.categoria_id === f.categoriaId) &&
    (!f.tipo || l.tipo === f.tipo) &&
    (!f.empresaId || l.empresa_id === f.empresaId))
}

export const total = (linhas: FaturamentoMensal[]) => somar(linhas.map((l) => l.valor))
