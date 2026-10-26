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
