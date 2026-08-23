// Gemini API キーの接続テスト（課金なし: GET /v1beta/models）。
//
// 役割: キーの有効性と、入力中の音声モデル名が一覧にあるかを確認する。fetchImpl 注入でテスト可能。
export async function testGeminiConnection({ apiKey, model, fetchImpl = globalThis.fetch, signal } = {}) {
  const key = String(apiKey ?? '').trim()
  if (!key) return { ok: false, message: 'Gemini API キーが空です。' }
  if (/[^!-~]/.test(key)) return { ok: false, message: 'Gemini API キーに使用できない文字が含まれています。' }
  let response
  try {
    response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=${encodeURIComponent(key)}`, { signal })
  } catch (e) {
    return { ok: false, message: `API に到達できません（ネットワーク / CSP）: ${e?.message ?? e}` }
  }
  if (response.status === 400 || response.status === 401 || response.status === 403) {
    return { ok: false, message: `認証エラー（${response.status}）: API キーが無効か権限がありません。` }
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    return { ok: false, message: payload?.error?.message ?? `HTTP ${response.status}` }
  }
  const payload = await response.json().catch(() => null)
  const models = (payload?.models ?? []).map((m) => String(m.name ?? '').replace(/^models\//, ''))
  const want = String(model ?? '').trim()
  const modelFound = want ? models.includes(want) : true
  return {
    ok: true,
    modelFound,
    models,
    message: modelFound
      ? `接続 OK（利用可能モデル ${models.length} 件）`
      : `キーは有効ですが、モデル「${want}」は一覧にありません（Live 対応: ${models.filter((m) => /live/i.test(m)).slice(0, 4).join(', ') || '不明'}）`,
  }
}
