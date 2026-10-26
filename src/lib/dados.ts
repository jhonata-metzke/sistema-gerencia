import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { Categoria, Cliente, Sistema } from './types'

export function useCategorias() {
  return useQuery({
    queryKey: ['categorias'],
    queryFn: async () => {
      const { data, error } = await supabase.from('categorias_receita').select('*').order('nome')
      if (error) throw error
      return data as Categoria[]
    },
  })
}

export function useSistemas() {
  return useQuery({
    queryKey: ['sistemas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sistemas').select('*').order('nome')
      if (error) throw error
      return data as Sistema[]
    },
  })
}

export function useClientes() {
  return useQuery({
    queryKey: ['clientes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes').select('*').order('razao_social')
      if (error) throw error
      return data as Cliente[]
    },
  })
}

/** Lança o erro do Supabase (se houver) e devolve os dados. */
export function ok<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw r.error
  return r.data
}

/** Filtra pelo mês/ano de competência: devolve [inicio, fim] em AAAA-MM-DD (fim = 1º dia do último mês). */
export function intervaloCompetencia(ano: number, mes: number): [string, string] {
  const p = (m: number) => `${ano}-${String(m).padStart(2, '0')}-01`
  return mes === 0 ? [p(1), p(12)] : [p(mes), p(mes)]
}
