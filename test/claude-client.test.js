// testClaudeConnection（/v1/models による接続テスト）のテスト。fetchImpl 注入。
import test from 'node:test'
import assert from 'node:assert/strict'
import { testClaudeConnection } from '../src/agent/claude-client.js'

const fake = (status, body) => async (url, init) => {
  assert.match(url, /\/v1\/models/)
  assert.equal(init.headers['x-key'] ?? init.headers['x-api-key'], 'sk-ant-x')
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

test('有効なキーでモデル一覧が取れれば ok、モデル名の有無を返す', async () => {
  const fetchImpl = fake(200, { data: [{ id: 'claude-opus-4-8' }, { id: 'claude-sonnet-4-6' }] })
  const r1 = await testClaudeConnection({ apiKey: 'sk-ant-x', model: 'claude-opus-4-8', fetchImpl })
  assert.equal(r1.ok, true)
  assert.equal(r1.modelFound, true)
  const r2 = await testClaudeConnection({ apiKey: 'sk-ant-x', model: 'claude-nope', fetchImpl })
  assert.equal(r2.ok, true)
  assert.equal(r2.modelFound, false)
  assert.match(r2.message, /一覧にありません/)
})

test('401 / 空キー / 不正文字 / ネットワーク障害は ok:false', async () => {
  assert.equal((await testClaudeConnection({ apiKey: 'sk-ant-x', fetchImpl: fake(401, {}) })).ok, false)
  assert.match((await testClaudeConnection({ apiKey: '' })).message, /空/)
  assert.match((await testClaudeConnection({ apiKey: 'sk ant' })).message, /使用できない文字/)
  const down = async () => { throw new Error('Failed to fetch') }
  assert.match((await testClaudeConnection({ apiKey: 'sk-ant-x', fetchImpl: down })).message, /到達できません/)
})
