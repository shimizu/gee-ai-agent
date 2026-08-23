// ToolRegistry（ツール定義と実装の 1 対 1 管理）の単体テスト。
import test from 'node:test'
import assert from 'node:assert/strict'

import { ToolRegistry } from '../src/agent/tool-registry.js'

test('登録した定義と実装を取得・実行できる', async () => {
  const registry = new ToolRegistry().register(
    { name: 'echo', description: 'そのまま返す', input_schema: { type: 'object' } },
    async ({ value }) => ({ value }),
  )
  assert.equal(registry.has('echo'), true)
  assert.equal(registry.definitions().length, 1)
  assert.equal(registry.definitions()[0].name, 'echo')
  assert.deepEqual(await registry.execute('echo', { value: 42 }), { value: 42 })
})

test('name 無しの定義・関数でないハンドラ・重複登録は拒否する', () => {
  const registry = new ToolRegistry()
  assert.throws(() => registry.register({}, () => {}), /name/)
  assert.throws(() => registry.register({ name: 'x' }, 123), /関数/)
  registry.register({ name: 'x' }, () => {})
  assert.throws(() => registry.register({ name: 'x' }, () => {}), /既に登録/)
})

test('未登録ツールの実行は拒否する', async () => {
  const registry = new ToolRegistry()
  await assert.rejects(() => registry.execute('missing', {}), /未登録/)
})
