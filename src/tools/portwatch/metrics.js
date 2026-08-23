// データセットの行に対する決定論的な分析（純関数・テスト対象）。
//
// 役割: summary（件数・最新・平均・最小最大・標準偏差・合計）/ trend / anomaly（28 日平滑＋
//       年間 Z スコア）を数値列ごとに計算する。PortWatch に限らず date 列 + 数値列を持つ
//       データセット（GEE 時系列）にも使う。
// 流用元: reference/portwatch-dashboard/src/analysis/metrics.js（date 列名の推定を汎用化）
import { analyzeSeries, classify } from './anomaly.js'

export const SUPPORTED_OPERATIONS = ['summary', 'trend', 'anomaly']

const NON_NUMERIC = new Set(['date', 'portid', 'portname', 'ObjectId', 'year', 'month', 'day'])

export function numericColumns(records) {
  const cols = new Set()
  for (const record of records.slice(0, 50)) {
    for (const [key, value] of Object.entries(record)) {
      if (!NON_NUMERIC.has(key) && typeof value === 'number') cols.add(key)
    }
  }
  return [...cols]
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null
  const f = 10 ** digits
  return Math.round(value * f) / f
}

function basicStats(values) {
  const n = values.length
  if (n === 0) return { count: 0 }
  const sum = values.reduce((s, v) => s + v, 0)
  const mean = sum / n
  const variance = n > 1 ? values.reduce((s, v) => s + (v - mean) ** 2, 0) / n : 0
  return {
    count: n,
    latest: values[n - 1],
    sum: round(sum),
    mean: round(mean),
    min: Math.min(...values),
    max: Math.max(...values),
    std: round(Math.sqrt(variance)),
  }
}

function valuesFor(records, metric) {
  return records.map((r) => r[metric]).filter((v) => v != null && Number.isFinite(v))
}

// records: 時系列レコード（dateColumn + 指標列）。operation: summary | trend | anomaly。
export function runMetricAnalysis({ records, operation, metric, dateColumn = 'date' }) {
  if (!Array.isArray(records) || records.length === 0) throw new Error('分析対象のレコードがありません。')
  if (!SUPPORTED_OPERATIONS.includes(operation)) {
    throw new Error(`operation は ${SUPPORTED_OPERATIONS.join(' / ')} のいずれかです。`)
  }
  const metrics = metric ? [metric] : numericColumns(records)
  if (metrics.length === 0) throw new Error('数値指標の列が見つかりません。')

  if (operation === 'summary') {
    const results = metrics.map((m) => ({ metric: m, ...basicStats(valuesFor(records, m)) }))
    return { operation, recordCount: records.length, metrics: results }
  }

  const results = metrics.map((m) => {
    const series = records.map((r) => ({ date: r[dateColumn], value: r[m] }))
    const stat = analyzeSeries(series)
    if (!stat) return { metric: m, signal: 'ok', insufficient: true, note: '点数不足（70 点以上の日次データが必要）' }
    return {
      metric: m,
      signal: classify(stat),
      latest: stat.latest,
      latestDate: stat.latestDate,
      current: stat.current,
      previousMonth: stat.baseline,
      pctChange: stat.pctChange,
      sigma: stat.sigma,
      yearMean: stat.mean,
      points: stat.points,
    }
  })
  return { operation, recordCount: records.length, metrics: results }
}
