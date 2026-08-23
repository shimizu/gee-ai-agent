// エージェントが書いた Earth Engine JavaScript をブラウザ内で実行するサンドボックス。
//
// 役割: Code Editor 風に `ee` と `ctx` だけを引数に持つ関数本体としてコードを実行し、
//       戻り値（ee オブジェクト or プレーン値）を返す。危険な API の簡易ブラックリスト、
//       タイムアウト、構文エラーの分かりやすい変換を行う。
// 関係: tools/gee/handlers.js が ee_run / ee_add_layer / ee_describe / ee_time_series から呼ぶ。
//       実行は利用者自身のブラウザ・自身の鍵で行われる（Code Editor と同じ信頼モデル）。
import { evaluate, withTimeout } from './ee-promise.js'
import { normalizeEeError } from './ee-errors.js'

// コード内で許可しない API（認証の書き換え・ストレージ・DOM・ネットワーク直叩き）。
const FORBIDDEN = [
  /ee\s*\.\s*data\s*\.\s*(authenticate|setAuthToken|clearAuthToken|setProject)/,
  /\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/,
  /\bdocument\s*\./,
  /\bwindow\s*\./,
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bimport\s*\(/,
  /\beval\s*\(/,
  /\bFunction\s*\(/,
]

export function checkForbidden(code) {
  const hit = FORBIDDEN.find((re) => re.test(code))
  if (hit) {
    throw new Error(
      'コード内で許可されていない API が使われています（使用できるのは ee.* と ctx.* のみ）。該当: ' +
        String(hit),
    )
  }
}

// code を非同期関数本体としてコンパイルする。`return` で結果を返す。await 可。
export function compileEeCode(code) {
  const source = String(code ?? '')
  if (!source.trim()) throw new Error('code が空です。')
  checkForbidden(source)
  try {
    return new Function('ee', 'ctx', `'use strict';\nreturn (async () => {\n${source}\n})()`)
  } catch (e) {
    throw new Error(`EE コードの構文エラー: ${e.message}`, { cause: e })
  }
}

// コードを実行して戻り値をそのまま返す（ee オブジェクトは評価しない）。
export async function runEeCode({ ee, code, ctx = {}, timeoutMs = 180_000 }) {
  const fn = compileEeCode(code)
  try {
    return await withTimeout(
      Promise.resolve(fn(ee, ctx)),
      timeoutMs,
      'EE コードの実行がタイムアウトしました。',
    )
  } catch (e) {
    throw new Error(normalizeEeError(e), { cause: e })
  }
}

// 戻り値を JSON 化できる値に解決する。ee オブジェクトなら evaluate、それ以外はそのまま。
export async function resolveResult(ee, value, { timeoutMs } = {}) {
  if (value == null) return null
  if (isEeObject(ee, value)) {
    try {
      return await evaluate(value, { timeoutMs })
    } catch (e) {
      throw new Error(normalizeEeError(e), { cause: e })
    }
  }
  if (Array.isArray(value) && value.some((v) => isEeObject(ee, v))) {
    const out = []
    for (const v of value) out.push(await resolveResult(ee, v, { timeoutMs }))
    return out
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = await resolveResult(ee, v, { timeoutMs })
    return out
  }
  return value
}

export function isEeObject(ee, value) {
  return Boolean(value && ee?.ComputedObject && value instanceof ee.ComputedObject)
}

// 型名（Image / ImageCollection / FeatureCollection / Geometry / Feature / Number / ...）を返す。
export function eeTypeName(ee, value) {
  if (!isEeObject(ee, value)) return typeof value
  if (typeof value.name === 'function') {
    try {
      return value.name()
    } catch {
      // fall through
    }
  }
  return value.constructor?.name ?? 'ComputedObject'
}
