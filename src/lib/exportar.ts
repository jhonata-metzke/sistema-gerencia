import * as XLSX from 'xlsx'

export type LinhaExport = Record<string, string | number | null>

function baixar(nome: string, blob: Blob) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = nome
  a.click()
  URL.revokeObjectURL(a.href)
}

// Excel em pt-BR espera ';' como separador e BOM para acentuação.
export function exportarCsv(nome: string, linhas: LinhaExport[]) {
  if (!linhas.length) return
  const cab = Object.keys(linhas[0])
  const esc = (v: unknown) => {
    const t = v === null || v === undefined ? '' : String(v)
    return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }
  const csv = [cab.join(';'), ...linhas.map((l) => cab.map((c) => esc(l[c])).join(';'))].join('\r\n')
  baixar(`${nome}.csv`, new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
}

export function exportarXlsx(nome: string, linhas: LinhaExport[]) {
  if (!linhas.length) return
  const ws = XLSX.utils.json_to_sheet(linhas)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Relatório')
  XLSX.writeFile(wb, `${nome}.xlsx`)
}

const TABELAS_BACKUP = ['empresas', 'clientes', 'sistemas', 'categorias_receita', 'contratos', 'contrato_versoes', 'adicionais', 'cobrancas', 'cobranca_adicionais',
  'pagamentos', 'vendas', 'venda_itens', 'venda_ajustes', 'parametros_limite', 'papeis_usuario'] as const

interface ClienteConsulta { from: (t: string) => { select: (c: string) => { range: (a: number, b: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> } } }

// Uma aba por tabela, lendo em páginas de 1.000 linhas (limite do backend); respeita as permissões de quem exporta.
export async function exportarBackup(sb: ClienteConsulta): Promise<number> {
  const wb = XLSX.utils.book_new()
  for (const t of TABELAS_BACKUP) {
    const linhas: Record<string, unknown>[] = []
    for (let i = 0; ; i += 1000) {
      const r = await sb.from(t).select('*').range(i, i + 999)
      if (r.error) throw new Error(`${t}: ${r.error.message}`)
      const pag = (r.data ?? []) as Record<string, unknown>[]
      linhas.push(...pag)
      if (pag.length < 1000) break
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas.map((l) => Object.fromEntries(Object.entries(l).map(([k, v]) => [k, v !== null && typeof v === 'object' ? JSON.stringify(v) : v])))), t.slice(0, 31))
  }
  XLSX.writeFile(wb, `backup-gestao-${new Date().toISOString().slice(0, 10)}.xlsx`)
  return TABELAS_BACKUP.length
}
