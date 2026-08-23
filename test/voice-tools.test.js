// 音声エージェントへ公開する関数宣言とディスパッチの単体テスト。
import test from 'node:test'
import assert from 'node:assert/strict'
import { CAPTURE_MAP, RUN_PROMPT, VOICE_FUNCTION_DECLARATIONS, VOICE_TOOLS, dispatchToolCall } from '../src/voice/voice-tools.js'

test('公開するのは run_prompt と capture_map だけ（アプリのツールは含まない）', () => {
  const names = VOICE_FUNCTION_DECLARATIONS.map((d) => d.name)
  assert.deepEqual(names, [RUN_PROMPT, CAPTURE_MAP])
  for (const forbidden of ['ee_run', 'ee_add_layer', 'show_chart', 'portwatch_fetch_metrics', 'remove_layer']) {
    assert.ok(!names.includes(forbidden))
  }
  assert.deepEqual(VOICE_TOOLS, [{ functionDeclarations: VOICE_FUNCTION_DECLARATIONS }])
})

test('run_prompt は text 必須で「送信・実行」まで行うと宣言している', () => {
  const decl = VOICE_FUNCTION_DECLARATIONS.find((d) => d.name === RUN_PROMPT)
  assert.deepEqual(decl.parameters.required, ['text'])
  assert.match(decl.description, /送信/)
  assert.match(decl.description, /busy/)
})

test('dispatch は id/name を保ち、未対応・text 欠落は ok:false', async () => {
  const responses = await dispatchToolCall(
    { functionCalls: [{ id: 'c1', name: RUN_PROMPT, args: { text: 'NDVI を出して' } }, { id: 'c2', name: 'nope', args: {} }, { id: 'c3', name: RUN_PROMPT, args: {} }] },
    { [RUN_PROMPT]: async ({ text }) => ({ ok: true, submitted: true, chars: text.length }) },
  )
  assert.deepEqual(responses[0], { id: 'c1', name: RUN_PROMPT, response: { ok: true, submitted: true, chars: 9 } })
  assert.equal(responses[1].response.ok, false)
  assert.match(responses[2].response.error, /text/)
})
