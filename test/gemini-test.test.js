// Gemini 接続テスト（/v1beta/models）の単体テスト。
import test from 'node:test'
import assert from 'node:assert/strict'
import { testGeminiConnection } from '../src/voice/gemini-test.js'

test('有効キーでモデル一覧が取れる / モデル名の有無', async () => {
  const fetchImpl = async (url) => {
    assert.match(url, /generativelanguage\.googleapis\.com\/v1beta\/models/)
    return { ok: true, status: 200, json: async () => ({ models: [{ name: 'models/gemini-3.1-flash-live-preview' }, { name: 'models/gemini-2.5-flash' }] }) }
  }
  const r = await testGeminiConnection({ apiKey: 'AIzaX', model: 'gemini-3.1-flash-live-preview', fetchImpl })
  assert.equal(r.ok, true)
  assert.equal(r.modelFound, true)
  const r2 = await testGeminiConnection({ apiKey: 'AIzaX', model: 'nope', fetchImpl })
  assert.equal(r2.modelFound, false)
  assert.match(r2.message, /live/i)
})

test('認証エラー・空キーは ok:false', async () => {
  const bad = async () => ({ ok: false, status: 400, json: async () => ({}) })
  assert.equal((await testGeminiConnection({ apiKey: 'AIzaX', fetchImpl: bad })).ok, false)
  assert.match((await testGeminiConnection({ apiKey: '' })).message, /空/)
})
