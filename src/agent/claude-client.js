// Claude Messages API を呼び出す薄いクライアント。
//
// 役割: HTTP の詳細（ヘッダ・リトライ・プロンプトキャッシュ）を runtime から分離する。
//       ブラウザから直接叩くため anthropic-dangerous-direct-browser-access ヘッダを付ける。
// 関係: App から runAgent の callModel として注入される。fetchImpl 差し替えでテスト可能。
//
// 流用元: reference/e-Stat-Web-AI-Agent/src/agent/claude-client.js（そのまま）
const CLAUDE_MESSAGES_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

// 一時的な障害（レート制限・過負荷・サーバーエラー）は指数バックオフで再試行する。
const RETRYABLE_STATUSES = new Set([429, 500, 529])
const DEFAULT_MAX_RETRIES = 3
const BASE_BACKOFF_MS = 1000

// 中断シグナルを尊重しながら指定ミリ秒待機する。
function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener?.('abort', onAbort)
      resolve()
    }, ms)
    function onAbort() {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener?.('abort', onAbort, { once: true })
  })
}

// Retry-After ヘッダ（秒）を優先し、なければ指数バックオフの待機時間を決める。
function backoffMs(response, attempt) {
  const retryAfter = Number(response?.headers?.get?.('retry-after'))
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return retryAfter * 1000
  }
  return BASE_BACKOFF_MS * 2 ** attempt
}

export async function callClaude({
  apiKey,
  model,
  messages,
  tools,
  system,
  maxTokens = 16000,
  signal,
  maxRetries = DEFAULT_MAX_RETRIES,
  fetchImpl = globalThis.fetch,
}) {
  if (!apiKey) {
    throw new Error('Claude APIキーが設定されていません。')
  }

  // HTTP ヘッダ値は ISO-8859-1（Latin-1）しか許されない。コピー時に全角文字・日本語・
  // 特殊な空白などが紛れ込むと fetch が「non ISO-8859-1 code point」で失敗するため、
  // 前後の空白を除去し、印字可能 ASCII 以外を含む場合は分かりやすいエラーにする。
  const cleanKey = String(apiKey).trim()
  if (/[^!-~]/.test(cleanKey)) {
    throw new Error(
      'Claude APIキーに使用できない文字（全角文字・空白・改行など）が含まれています。' +
        'キーを貼り付け直してください。',
    )
  }

  const body = {
    model,
    max_tokens: maxTokens,
    messages,
  }

  // システムプロンプトはプロンプトキャッシュ対象にする（tools → system の順でまとめてキャッシュ）。
  if (system) {
    body.system =
      typeof system === 'string'
        ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
        : system
  }
  if (tools && tools.length > 0) body.tools = tools

  let lastResponse = null
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetchImpl(CLAUDE_MESSAGES_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': cleanKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
      signal,
    })

    if (response.ok) {
      return response.json()
    }

    // リトライ可能なステータスで、まだ試行回数が残っていれば待って再試行する。
    if (RETRYABLE_STATUSES.has(response.status) && attempt < maxRetries) {
      lastResponse = response
      await delay(backoffMs(response, attempt), signal)
      continue
    }

    const payload = await response.json().catch(() => null)
    const message =
      payload?.error?.message ??
      `Claude APIの呼び出しに失敗しました（HTTP ${response.status}）。`
    throw new Error(message)
  }

  // 再試行が尽きた場合。最後のレスポンスからエラーメッセージを組み立てる。
  const payload = await lastResponse?.json().catch(() => null)
  const message =
    payload?.error?.message ??
    `Claude APIの呼び出しに失敗しました（HTTP ${lastResponse?.status ?? '?'}、再試行上限）。`
  throw new Error(message)
}

// 接続テスト: GET /v1/models（課金なし）でキーの有効性と、入力中のモデル名の存在を確認する。
// 戻り値 { ok, modelFound, models, message }。ネットワーク/認証エラーは ok:false で message に理由。
export async function testClaudeConnection({ apiKey, model, fetchImpl = globalThis.fetch, signal } = {}) {
  const cleanKey = String(apiKey ?? '').trim()
  if (!cleanKey) return { ok: false, message: 'API キーが空です。' }
  if (/[^!-~]/.test(cleanKey)) return { ok: false, message: 'API キーに全角文字・空白などの使用できない文字が含まれています。' }
  let response
  try {
    response = await fetchImpl('https://api.anthropic.com/v1/models?limit=1000', {
      method: 'GET',
      headers: {
        'x-api-key': cleanKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      signal,
    })
  } catch (e) {
    return { ok: false, message: `API に到達できません（ネットワーク / CSP / 拡張機能のブロック）: ${e?.message ?? e}` }
  }
  if (response.status === 401) return { ok: false, message: '認証エラー（401）: API キーが無効です。キーを確認してください。' }
  if (response.status === 403) return { ok: false, message: '権限エラー（403）: このキーでは利用できません。' }
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    return { ok: false, message: payload?.error?.message ?? `HTTP ${response.status}` }
  }
  const payload = await response.json().catch(() => null)
  const models = (payload?.data ?? []).map((m) => m.id)
  const modelFound = model ? models.includes(String(model).trim()) : true
  return {
    ok: true,
    modelFound,
    models,
    message: modelFound
      ? `接続 OK（利用可能モデル ${models.length} 件）`
      : `キーは有効ですが、モデル「${model}」は一覧にありません（入力ミスの可能性。利用可能: ${models.slice(0, 6).join(', ')} …）`,
  }
}
