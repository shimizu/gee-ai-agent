// runAgent（tool use ループ）の単体テスト。
// callModel と toolRegistry を注入し、ブラウザ非依存で挙動を検証する。
import test from 'node:test'
import assert from 'node:assert/strict'

import { runAgent } from '../src/agent/runtime.js'
import { ToolRegistry } from '../src/agent/tool-registry.js'

test('ツールを使わない応答を completed として返す', async () => {
  const result = await runAgent({
    instruction: '東京の境界を表示して',
    toolRegistry: new ToolRegistry(),
    callModel: async () => ({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: '完了しました。' }],
    }),
  })
  assert.equal(result.status, 'completed')
  assert.equal(result.content, '完了しました。')
})

test('tool use の結果を会話へ積んで次の応答へ進む', async () => {
  const registry = new ToolRegistry().register(
    { name: 'run_spatial_sql', description: '', input_schema: { type: 'object' } },
    async ({ layer_name }) => ({ layerId: layer_name, featureCount: 1 }),
  )

  let calls = 0
  const result = await runAgent({
    instruction: 'バッファを作って',
    toolRegistry: registry,
    callModel: async ({ messages }) => {
      calls += 1
      if (calls === 1) {
        return {
          stop_reason: 'tool_use',
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'run_spatial_sql',
              input: { sql: 'SELECT ...', layer_name: 'buf' },
            },
          ],
        }
      }
      // 2 回目: 直前に tool_result が積まれている。
      const last = messages.at(-1)
      assert.equal(last.role, 'user')
      assert.equal(last.content[0].type, 'tool_result')
      assert.equal(last.content[0].tool_use_id, 'tool-1')
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: '作成しました。' }] }
    },
  })

  assert.equal(calls, 2)
  assert.equal(result.status, 'completed')
})

test('ツール例外は is_error の tool_result としてモデルへ返り、ループは継続する', async () => {
  const registry = new ToolRegistry().register(
    { name: 'run_spatial_sql', description: '', input_schema: { type: 'object' } },
    async () => {
      throw new Error('CRS 不一致')
    },
  )

  let sawError = false
  const result = await runAgent({
    instruction: 'x',
    toolRegistry: registry,
    callModel: async ({ messages }) => {
      const last = messages.at(-1)
      if (last.role === 'user' && Array.isArray(last.content) && last.content[0]?.is_error) {
        sawError = true
        assert.match(last.content[0].content, /CRS 不一致/)
        return { stop_reason: 'end_turn', content: [{ type: 'text', text: '修正します。' }] }
      }
      return {
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 't1', name: 'run_spatial_sql', input: {} }],
      }
    },
  })

  assert.equal(sawError, true)
  assert.equal(result.status, 'completed')
})

test('中断シグナルで aborted を返す', async () => {
  const controller = new AbortController()
  controller.abort()
  const result = await runAgent({
    instruction: 'x',
    toolRegistry: new ToolRegistry(),
    signal: controller.signal,
    callModel: async () => {
      throw new Error('呼ばれないはず')
    },
  })
  assert.equal(result.status, 'aborted')
})
