// チャート spec の検証・正規化と、描画用の行データ整形（純関数・テスト対象）。
//
// 役割: show_chart ツールの入力（モデルが書く）を検証し、Recharts が描ける形に揃える。
//       列の存在確認、time 軸の昇順ソート、行数の間引き、ヒストグラムのビン生成を行う。
// 関係: tools/chart/handlers.js が validateChartSpec を呼び、ChartRenderer が rows/spec を描く。
export const CHART_TYPES = ['line', 'bar', 'area', 'scatter', 'histogram']
export const MAX_ROWS = 2000
export const MAX_SERIES = 6

// 入力 spec と行データから { spec, rows, warnings } を返す。問題があれば Error を投げる。
export function validateChartSpec(input, rowsIn) {
  const warnings = []
  if (!input || typeof input !== 'object') throw new Error('spec がオブジェクトではありません。')
  const type = String(input.type ?? 'line')
  if (!CHART_TYPES.includes(type)) throw new Error(`type は ${CHART_TYPES.join(' / ')} のいずれかです: ${type}`)
  if (!Array.isArray(rowsIn) || rowsIn.length === 0) throw new Error('描画する行データがありません。')

  const x = String(input.x ?? '')
  if (!x) throw new Error('x（横軸の列名）を指定してください。')
  const columns = new Set()
  for (const r of rowsIn.slice(0, 200)) if (r && typeof r === 'object') for (const k of Object.keys(r)) columns.add(k)
  if (!columns.has(x)) throw new Error(`x 列 "${x}" が行データにありません（列: ${[...columns].join(', ')}）`)

  // 系列（y 列）。histogram は x 列の分布なので y 不要。
  let series = []
  if (type !== 'histogram') {
    const raw = Array.isArray(input.series) && input.series.length ? input.series : input.y ? [{ key: input.y }] : []
    if (!raw.length) throw new Error('y または series を指定してください。')
    series = raw.slice(0, MAX_SERIES).map((s) => {
      const item = typeof s === 'string' ? { key: s } : { ...s }
      item.key = String(item.key ?? '')
      if (!item.key) throw new Error('series の key が空です。')
      if (!columns.has(item.key)) throw new Error(`series 列 "${item.key}" が行データにありません。`)
      item.label = item.label ? String(item.label) : item.key
      return item
    })
    if (raw.length > MAX_SERIES) warnings.push(`系列は最大 ${MAX_SERIES} 本まで表示します。`)
  }

  const xType = input.xType ?? guessXType(rowsIn, x)
  if (!['time', 'category', 'number'].includes(xType)) throw new Error(`xType は time / category / number: ${xType}`)

  // 行の整形: 必要列だけ残し、time/number は昇順ソート、多すぎれば間引く。
  const keep = [x, ...series.map((s) => s.key)]
  let rows = rowsIn
    .filter((r) => r && typeof r === 'object' && r[x] != null)
    .map((r) => Object.fromEntries(keep.map((k) => [k, normalizeValue(r[k], k === x ? xType : 'number')])))
  if (xType === 'time') rows.sort((a, b) => (a[x] < b[x] ? -1 : a[x] > b[x] ? 1 : 0))
  if (xType === 'number') rows.sort((a, b) => a[x] - b[x])
  if (rows.length > MAX_ROWS) {
    rows = thin(rows, MAX_ROWS)
    warnings.push(`行数が多いため ${MAX_ROWS} 行に間引きました。`)
  }

  const spec = {
    type,
    title: input.title ? String(input.title) : '',
    x,
    xType,
    series,
    yLabel: input.yLabel ? String(input.yLabel) : '',
    unit: input.unit ? String(input.unit) : '',
    stacked: Boolean(input.stacked),
    bins: type === 'histogram' ? clampInt(input.bins, 2, 100, 20) : undefined,
    referenceLines: Array.isArray(input.referenceLines)
      ? input.referenceLines.filter((l) => l && Number.isFinite(Number(l.y))).map((l) => ({ y: Number(l.y), label: String(l.label ?? '') }))
      : [],
    note: input.note ? String(input.note) : '',
    source: input.source ? String(input.source) : '',
  }

  if (type === 'histogram') {
    const values = rows.map((r) => Number(r[x])).filter((v) => Number.isFinite(v))
    if (!values.length) throw new Error(`histogram の x 列 "${x}" に数値がありません。`)
    rows = buildHistogram(values, spec.bins)
    spec.series = [{ key: 'count', label: '件数' }]
  }

  return { spec, rows, warnings }
}

export function guessXType(rows, x) {
  const sample = rows.slice(0, 20).map((r) => r?.[x]).filter((v) => v != null)
  if (!sample.length) return 'category'
  if (sample.every((v) => typeof v === 'number')) {
    // 1e12 以上なら epoch ms とみなす
    return sample.every((v) => v > 1e11) ? 'time' : 'number'
  }
  if (sample.every((v) => typeof v === 'string' && /^\d{4}(-\d{2}(-\d{2})?)?([T ].*)?$/.test(v))) return 'time'
  return 'category'
}

export function normalizeValue(v, kind) {
  if (v == null) return null
  if (kind === 'time') {
    if (typeof v === 'number') return new Date(v).toISOString().slice(0, 10)
    return String(v)
  }
  if (kind === 'number') {
    const n = typeof v === 'number' ? v : Number(v)
    return Number.isFinite(n) ? n : null
  }
  return v
}

// 等間隔に max 行を抜き出す（先頭と末尾は残す）。
export function thin(rows, max) {
  if (rows.length <= max) return rows
  const out = []
  const step = (rows.length - 1) / (max - 1)
  for (let i = 0; i < max; i++) out.push(rows[Math.round(i * step)])
  return out
}

export function buildHistogram(values, bins = 20) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const width = max === min ? 1 : (max - min) / bins
  const counts = new Array(bins).fill(0)
  for (const v of values) {
    let i = Math.floor((v - min) / width)
    if (i >= bins) i = bins - 1
    if (i < 0) i = 0
    counts[i] += 1
  }
  return counts.map((count, i) => {
    const x0 = min + i * width
    const x1 = x0 + width
    return { x0, x1, x: `${fmt(x0)}–${fmt(x1)}`, count }
  })
}

function fmt(v) {
  return Number.isInteger(v) ? String(v) : v.toPrecision(3)
}

function clampInt(v, lo, hi, fallback) {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(hi, Math.max(lo, Math.round(n)))
}
