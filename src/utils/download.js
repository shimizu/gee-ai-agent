// ブラウザでファイルをダウンロードさせるユーティリティ。
//
// 役割: チャートの CSV 保存などで Blob を a[download] 経由で保存する。
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// 行配列を CSV 文字列にする（列は columns の順。値はダブルクォートでエスケープ）。
export function rowsToCsv(rows, columns) {
  const esc = (v) => {
    if (v == null) return ''
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = columns.map(esc).join(',')
  const body = rows.map((r) => columns.map((c) => esc(r[c])).join(','))
  return [header, ...body].join('\n')
}
