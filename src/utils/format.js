// 表示用フォーマッタ（純関数）。
//
// 役割: 数値・日付・bounds を UI とツール結果向けに短く整形する。

// 数値を有効桁 digits で丸める（null/NaN はそのまま null）。
export function roundTo(value, digits = 4) {
  if (value == null || !Number.isFinite(value)) return null
  const f = 10 ** digits
  return Math.round(value * f) / f
}

// 桁区切りと小数桁を調整した数値表示。
export function formatNumber(value, { maxFractionDigits = 3 } = {}) {
  if (value == null || !Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  const digits = abs >= 1000 ? 0 : abs >= 10 ? 1 : maxFractionDigits
  return value.toLocaleString('ja-JP', { maximumFractionDigits: digits })
}

// bounds [w, s, e, n] を小数 digits 桁に丸める（プロンプト注入・ログ用）。
export function roundBounds(bounds, digits = 3) {
  if (!Array.isArray(bounds) || bounds.length !== 4) return null
  return bounds.map((v) => roundTo(v, digits))
}

// ISO 日付文字列（YYYY-MM-DD）にする。Date / epoch ms / 文字列を受ける。
export function toIsoDate(value) {
  if (value == null) return null
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toISOString().slice(0, 10)
}

// 長い文字列を max 文字で省略する。
export function truncate(text, max = 200) {
  const s = String(text ?? '')
  return s.length > max ? `${s.slice(0, max)}…` : s
}
