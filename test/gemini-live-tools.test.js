// buildLiveTools（googleSearch と関数宣言の併用）のテスト。@google/genai は import するが接続はしない。
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildLiveTools } from '../src/voice/gemini-live-client.js'
import { VOICE_TOOLS } from '../src/voice/voice-tools.js'

test('enableSearch=false は関数宣言のみ、true は googleSearch を先頭に併用', () => {
  assert.deepEqual(buildLiveTools({ enableSearch: false }), VOICE_TOOLS)
  const t = buildLiveTools({ enableSearch: true })
  assert.deepEqual(t[0], { googleSearch: {} })
  assert.deepEqual(t.slice(1), VOICE_TOOLS)
})
