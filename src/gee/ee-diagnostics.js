// Earth Engine への接続失敗を切り分けるための診断ユーティリティ。
//
// 背景: EE クライアントは XHR の status が 0 のとき（= レスポンスが一切返らなかったとき）
//       "Failed to contact Earth Engine servers..." という同じ文言を返す。CSP でブロックされたのか、
//       拡張機能に潰されたのか、そもそも 401/403 なのかが区別できないため、失敗時に
//       実際の URL・ステータス・CSP 違反イベントを集めて日本語で説明する。
// 役割: (1) securitypolicyviolation の記録 (2) EE エンドポイントへの素の fetch プローブ
//       (3) meta の CSP から connect-src を読んで許可判定 (4) 説明文の組み立て（純関数）。
// 関係: ee-client.js が login/testConnection の失敗時に diagnoseEeConnectivity() を呼び、
//       結果をエラーメッセージ末尾に足す。DevTools からは window.__geeDiagnose() で単独実行できる。
//       本番ビルドにも含める（再現するのが GitHub Pages 等の本番オリジンだけのため）。
export const EE_API_ORIGIN = 'https://earthengine.googleapis.com'

// --- CSP 違反の記録 ---------------------------------------------------------
const cspViolations = []
let watcherInstalled = false

// document の securitypolicyviolation を購読する（複数回呼んでも 1 回だけ登録する）。
export function installCspWatcher(doc = globalThis.document) {
  if (watcherInstalled || !doc?.addEventListener) return false
  doc.addEventListener('securitypolicyviolation', (e) => {
    cspViolations.push({
      blockedURI: e.blockedURI ?? '',
      violatedDirective: e.violatedDirective ?? e.effectiveDirective ?? '',
      at: Date.now(),
    })
    if (cspViolations.length > 50) cspViolations.splice(0, cspViolations.length - 50)
  })
  watcherInstalled = true
  return true
}

export function getCspViolations() {
  return cspViolations.slice()
}

// --- CSP meta の解析（純関数） ---------------------------------------------
// index.html に注入した <meta http-equiv="Content-Security-Policy"> の content を返す。
export function readCspMeta(doc = globalThis.document) {
  const el = doc?.querySelector?.('meta[http-equiv="Content-Security-Policy"]')
  return el?.getAttribute?.('content') ?? null
}

// CSP 文字列から connect-src（無ければ default-src）のソース一覧を取り出す。
export function parseConnectSrc(csp) {
  if (typeof csp !== 'string' || !csp.trim()) return null
  const directives = new Map()
  for (const part of csp.split(';')) {
    const tokens = part.trim().split(/\s+/).filter(Boolean)
    if (tokens.length === 0) continue
    directives.set(tokens[0].toLowerCase(), tokens.slice(1))
  }
  return directives.get('connect-src') ?? directives.get('default-src') ?? null
}

// 1 つの CSP ソース表現が URL に一致するか。'self' / スキーム付きホスト / *.host に対応する。
function matchesSource(source, url, origin) {
  const src = String(source ?? '').trim()
  if (!src) return false
  if (src === '*') return true
  if (src === "'none'") return false
  if (src === "'self'") return origin != null && url.origin === origin
  if (src.startsWith("'")) return false // 'unsafe-inline' 等はホスト判定に無関係
  if (src.endsWith(':')) return url.protocol === src // scheme-source（例: https:）

  let host = src
  let scheme = null
  const schemeSep = src.indexOf('://')
  if (schemeSep >= 0) {
    scheme = src.slice(0, schemeSep + 1)
    host = src.slice(schemeSep + 3)
  }
  host = host.split('/')[0]
  if (scheme && url.protocol !== scheme) return false
  if (host.startsWith('*.')) return url.hostname === host.slice(2) || url.hostname.endsWith(host.slice(1))
  return url.hostname === host
}

// connect-src の一覧で url が許可されるか。sources が null（CSP 無し）なら null を返す。
export function isConnectAllowed(sources, urlString, origin = null) {
  if (!sources) return null
  let url
  try {
    url = new URL(urlString)
  } catch {
    return null
  }
  return sources.some((s) => matchesSource(s, url, origin))
}

// --- エンドポイントへのプローブ --------------------------------------------
// EE の algorithms を素の fetch で叩き、到達可否を分類する。認証が無くても 401 が返れば
// 「ネットワーク的には到達できている」ことが確定する（＝ CSP・拡張機能の問題ではない）。
export async function probeEeEndpoint({
  project = 'earthengine-legacy',
  authHeader = null,
  timeoutMs = 15_000,
  fetchImpl = globalThis.fetch,
  origin = EE_API_ORIGIN,
} = {}) {
  const url = `${origin}/v1/projects/${encodeURIComponent(project)}/algorithms?prettyPrint=false`
  if (typeof fetchImpl !== 'function') return { kind: 'unsupported', url, status: null, error: 'fetch がありません' }

  const controller = typeof AbortController === 'function' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
  const before = cspViolations.length
  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      headers: authHeader ? { Authorization: authHeader } : {},
      signal: controller?.signal,
    })
    return { kind: res.ok ? 'ok' : 'http', url, status: res.status, error: '' }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    // CSP ブロックは fetch が TypeError で落ちたうえで securitypolicyviolation が発火する。
    await new Promise((r) => setTimeout(r, 0))
    const blocked = cspViolations.slice(before).some((v) => String(v.blockedURI).startsWith(origin))
    if (blocked) return { kind: 'csp', url, status: null, error: message }
    if (e?.name === 'AbortError') return { kind: 'timeout', url, status: null, error: message }
    return { kind: 'network', url, status: null, error: message }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

// --- 説明文の組み立て（純関数） --------------------------------------------
const KIND_LINES = {
  ok: 'EE エンドポイントへ到達できました（HTTP 200）。ネットワーク・CSP は正常です。',
  http: null, // status によって文言を変える
  csp: 'CSP によってブロックされました。connect-src に EE のホストが入っていません。',
  network: 'fetch がネットワークレベルで失敗しました。CSP 違反イベントは出ていないため、拡張機能（広告ブロッカー等）・プロキシ・ファイアウォールによる遮断が疑われます。',
  timeout: 'タイムアウトしました。回線か経路上のプロキシで止められている可能性があります。',
  unsupported: 'この環境では fetch が使えず、プローブできませんでした。',
}

// probe 結果と CSP 情報から、ログにそのまま出せる日本語の診断文を作る。
export function describeConnectivity({
  origin = '',
  probe = null,
  cspConnectSrc = null,
  allowed = null,
  violations = [],
} = {}) {
  const lines = ['--- EE 接続診断 ---']
  lines.push(`ページのオリジン: ${origin || '(不明)'}`)

  if (probe) {
    lines.push(`プローブ: GET ${probe.url}`)
    if (probe.kind === 'http') {
      const auth = probe.status === 401 || probe.status === 403
      lines.push(
        `結果: HTTP ${probe.status} — サーバまで到達しています。${
          auth ? 'ネットワークは正常で、認証・権限の問題です（再ログイン、プロジェクトの EE 登録・API 有効化を確認）。' : ''
        }`,
      )
    } else {
      lines.push(`結果: ${probe.kind}${probe.status != null ? ` (HTTP ${probe.status})` : ''} — ${KIND_LINES[probe.kind] ?? probe.error}`)
      if (probe.error && probe.kind !== 'ok') lines.push(`fetch のエラー: ${probe.error}`)
    }
  }

  if (cspConnectSrc) {
    lines.push(`CSP connect-src: ${cspConnectSrc.join(' ')}`)
    if (allowed === false) {
      lines.push(`→ ${EE_API_ORIGIN} は connect-src に含まれていません。vite.config.js の CSP に追加してください。`)
    } else if (allowed === true) {
      lines.push(`→ ${EE_API_ORIGIN} は connect-src で許可されています（CSP は原因ではありません）。`)
    }
  } else {
    lines.push('CSP meta: なし（開発サーバか、CSP 未注入のビルド）。')
  }

  if (violations.length > 0) {
    lines.push('CSP 違反イベント:')
    for (const v of violations.slice(-10)) lines.push(`  - ${v.violatedDirective}: ${v.blockedURI}`)
  }

  // 到達できているのに EE クライアントだけ失敗する場合は、EE の XHR 特有の要因を示す。
  if (probe && (probe.kind === 'ok' || probe.kind === 'http')) {
    lines.push(
      '素の fetch は通っているのに EE クライアントだけ失敗する場合は、拡張機能が XMLHttpRequest を横取りしているか、' +
        'OAuth トークンが取得できていない可能性があります。シークレットウィンドウ（拡張機能オフ）で再確認してください。',
    )
  }
  return lines.join('\n')
}

// --- 入口 -------------------------------------------------------------------
// 失敗時に呼ぶ総合診断。副作用は console へのログのみ。文字列を返す。
export async function diagnoseEeConnectivity({ project, authHeader = null, fetchImpl, doc = globalThis.document } = {}) {
  installCspWatcher(doc)
  const origin = globalThis.location?.origin ?? ''
  const csp = readCspMeta(doc)
  const cspConnectSrc = parseConnectSrc(csp)
  const allowed = isConnectAllowed(cspConnectSrc, `${EE_API_ORIGIN}/v1/`, origin)
  const probe = await probeEeEndpoint({ project, authHeader, fetchImpl })
  const text = describeConnectivity({ origin, probe, cspConnectSrc, allowed, violations: getCspViolations() })
  console.warn(text)
  return text
}
