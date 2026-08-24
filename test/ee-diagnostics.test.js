// EE 接続診断の純ロジック（CSP 解析・許可判定・説明文・プローブの分類）のテスト。
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseConnectSrc,
  isConnectAllowed,
  describeConnectivity,
  probeEeEndpoint,
  EE_API_ORIGIN,
} from '../src/gee/ee-diagnostics.js'

const CSP =
  "default-src 'self'; script-src 'self' 'unsafe-eval' https://accounts.google.com; " +
  'connect-src \'self\' https://api.anthropic.com https://earthengine.googleapis.com https://*.basemaps.cartocdn.com; ' +
  "img-src 'self' data:"

test('parseConnectSrc は connect-src を、無ければ default-src を返す', () => {
  assert.deepEqual(parseConnectSrc(CSP), [
    "'self'",
    'https://api.anthropic.com',
    'https://earthengine.googleapis.com',
    'https://*.basemaps.cartocdn.com',
  ])
  assert.deepEqual(parseConnectSrc("default-src 'self'; img-src *"), ["'self'"])
  assert.equal(parseConnectSrc(''), null)
  assert.equal(parseConnectSrc(null), null)
})

test('isConnectAllowed はホスト・ワイルドカード・self を判定する', () => {
  const sources = parseConnectSrc(CSP)
  assert.equal(isConnectAllowed(sources, `${EE_API_ORIGIN}/v1/`), true)
  assert.equal(isConnectAllowed(sources, 'https://a.basemaps.cartocdn.com/x.png'), true)
  assert.equal(isConnectAllowed(sources, 'https://example.com/'), false)
  // 'self' はページのオリジンと一致したときだけ許可。
  assert.equal(isConnectAllowed(sources, 'https://shimizu.github.io/x', 'https://shimizu.github.io'), true)
  assert.equal(isConnectAllowed(sources, 'https://shimizu.github.io/x', 'http://localhost:5173'), false)
  // http:// のスキーム違いは不許可。
  assert.equal(isConnectAllowed(sources, 'http://earthengine.googleapis.com/v1/'), false)
  // CSP が無い場合は判定不能。
  assert.equal(isConnectAllowed(null, `${EE_API_ORIGIN}/v1/`), null)
})

test('describeConnectivity は 401 を「到達している」と説明する', () => {
  const text = describeConnectivity({
    origin: 'https://shimizu.github.io',
    probe: { kind: 'http', status: 401, url: `${EE_API_ORIGIN}/v1/projects/p/algorithms`, error: '' },
    cspConnectSrc: parseConnectSrc(CSP),
    allowed: true,
    violations: [],
  })
  assert.match(text, /HTTP 401/)
  assert.match(text, /サーバまで到達/)
  assert.match(text, /CSP は原因ではありません/)
})

test('describeConnectivity は CSP 未許可と違反イベントを指摘する', () => {
  const text = describeConnectivity({
    origin: 'https://shimizu.github.io',
    probe: { kind: 'csp', status: null, url: `${EE_API_ORIGIN}/v1/x`, error: 'Failed to fetch' },
    cspConnectSrc: ["'self'"],
    allowed: false,
    violations: [{ violatedDirective: 'connect-src', blockedURI: `${EE_API_ORIGIN}/v1/x`, at: 0 }],
  })
  assert.match(text, /connect-src に含まれていません/)
  assert.match(text, /CSP 違反イベント/)
  assert.match(text, /blockedURI|earthengine\.googleapis\.com/)
})

test('describeConnectivity は拡張機能の可能性を network で示す', () => {
  const text = describeConnectivity({
    origin: 'https://shimizu.github.io',
    probe: { kind: 'network', status: null, url: `${EE_API_ORIGIN}/v1/x`, error: 'Failed to fetch' },
    cspConnectSrc: null,
    allowed: null,
    violations: [],
  })
  assert.match(text, /拡張機能/)
  assert.match(text, /CSP meta: なし/)
})

test('probeEeEndpoint は HTTP 応答と失敗を分類する', async () => {
  const ok = await probeEeEndpoint({
    project: 'p',
    fetchImpl: async (url) => {
      assert.match(url, /\/v1\/projects\/p\/algorithms/)
      return { ok: true, status: 200 }
    },
  })
  assert.deepEqual({ kind: ok.kind, status: ok.status }, { kind: 'ok', status: 200 })

  const unauthorized = await probeEeEndpoint({ project: 'p', fetchImpl: async () => ({ ok: false, status: 401 }) })
  assert.deepEqual({ kind: unauthorized.kind, status: unauthorized.status }, { kind: 'http', status: 401 })

  const failed = await probeEeEndpoint({
    project: 'p',
    fetchImpl: async () => {
      throw new TypeError('Failed to fetch')
    },
  })
  assert.equal(failed.kind, 'network')
  assert.match(failed.error, /Failed to fetch/)

  const unsupported = await probeEeEndpoint({ project: 'p', fetchImpl: null })
  assert.equal(unsupported.kind, 'unsupported')
})

test('probeEeEndpoint は認証ヘッダーがあれば付ける', async () => {
  let seen = null
  await probeEeEndpoint({
    project: 'p',
    authHeader: 'Bearer xyz',
    fetchImpl: async (_url, init) => {
      seen = init.headers
      return { ok: true, status: 200 }
    },
  })
  assert.deepEqual(seen, { Authorization: 'Bearer xyz' })
})
