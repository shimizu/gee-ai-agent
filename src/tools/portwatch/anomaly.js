// 時系列から「極端な増減（異常）」を検知する（純関数・テスト対象）。
//
// 役割: AIS 由来でノイズの多い日次海運データ向けに、28 日平均と年間 Z スコアで現在水準を評価する。
//       GEE の時系列（date 列 + 数値列）にも汎用的に使える。
// 流用元: reference/portwatch-dashboard/scripts/lib/anomaly.js（そのまま）
export const THRESHOLDS = {
  warn: { sigma: 1.5, pct: 30, sigmaGate: 0.75 },
  danger: { sigma: 2.5, pct: 50, sigmaGate: 1.0 },
}

const RECENT_WINDOW = 28
const TAIL_SKIP = 2
const BASELINE_WINDOW = 365
const MIN_POINTS = 70

const SEVERITY_RANK = { ok: 0, warn: 1, danger: 2 }

function mean(values) {
  if (!values.length) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function std(values) {
  if (values.length < 2) return 0
  const m = mean(values)
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)))
}

function round(value, digits = 2) {
  const f = 10 ** digits
  return Math.round(value * f) / f
}

function rollingMean(values, window) {
  const out = []
  for (let i = window - 1; i < values.length; i += 1) out.push(mean(values.slice(i - window + 1, i + 1)))
  return out
}

// series: [{date, value}] 昇順。統計量、または点数不足なら null。
export function analyzeSeries(series) {
  const clean = series.filter((d) => d && d.value != null && Number.isFinite(d.value))
  if (clean.length < MIN_POINTS) return null
  const values = clean.map((d) => d.value)
  const usable = TAIL_SKIP > 0 ? values.slice(0, -TAIL_SKIP) : values
  if (usable.length < RECENT_WINDOW * 2) return null
  const current = mean(usable.slice(-RECENT_WINDOW))
  const prior = mean(usable.slice(-2 * RECENT_WINDOW, -RECENT_WINDOW))
  const pctChange = prior ? ((current - prior) / Math.abs(prior)) * 100 : 0
  const smoothed = rollingMean(usable.slice(-BASELINE_WINDOW), RECENT_WINDOW)
  const m = mean(smoothed)
  const s = std(smoothed)
  const sigma = s ? (current - m) / s : 0
  const latest = clean[clean.length - 1]
  return {
    latest: latest.value,
    latestDate: latest.date,
    current: round(current),
    baseline: round(prior),
    mean: round(m),
    std: round(s),
    sigma: round(sigma),
    pctChange: round(pctChange, 1),
    points: clean.length,
  }
}

export function classify(stat) {
  if (!stat) return 'ok'
  const az = Math.abs(stat.sigma)
  const ap = Math.abs(stat.pctChange)
  const d = THRESHOLDS.danger
  if (az >= d.sigma || (ap >= d.pct && az >= d.sigmaGate)) return 'danger'
  const w = THRESHOLDS.warn
  if (az >= w.sigma || (ap >= w.pct && az >= w.sigmaGate)) return 'warn'
  return 'ok'
}

export function worst(signals) {
  return signals.reduce((acc, sig) => (SEVERITY_RANK[sig] > SEVERITY_RANK[acc] ? sig : acc), 'ok')
}

export function severityRank(signal) {
  return SEVERITY_RANK[signal] ?? 0
}
