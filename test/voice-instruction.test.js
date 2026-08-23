// 音声エージェントの system instruction / 完了通知の単体テスト。
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCompletionNotice, buildContextSnapshot, buildVoiceInstruction, formatLayersForVoice } from '../src/voice/voice-instruction.js'

const LAYERS = [
  { layerId: 'lyr_001', name: 'NDVI 2024', kind: 'ee-raster', spec: { mode: 'raw' }, bandNames: ['NDVI'], visible: true },
  { layerId: 'lyr_002', name: '港', kind: 'vector', geomType: 'Point', featureCount: 3, visible: false },
]

test('レイヤー一覧は名前・種別・表示状態を含む', () => {
  assert.match(formatLayersForVoice([]), /ありません/)
  const text = formatLayersForVoice(LAYERS)
  assert.match(text, /NDVI 2024/)
  assert.match(text, /raw/)
  assert.match(text, /非表示/)
})

test('instruction は役割・run_prompt の意味・GEE 状態を含む', () => {
  const text = buildVoiceInstruction({ layers: LAYERS, datasets: [{ id: 'ds_001', title: 't', recordCount: 10 }], geeState: { status: 'idle' } })
  assert.match(text, /run_prompt/)
  assert.match(text, /そのまま送信・実行/)
  assert.match(text, /未ログイン/)
  assert.match(text, /ds_001/)
  const snap = buildContextSnapshot({ layers: LAYERS, datasets: [], geeState: { status: 'ready' }, isAgentRunning: true })
  assert.equal(snap.gee_logged_in, true)
  assert.equal(snap.claude_running, true)
  assert.equal(snap.layers[0].kind, 'raster/raw')
})

test('完了通知は Markdown を落として短くまとめる', () => {
  const notice = buildCompletionNotice({ status: 'completed', content: '**完了**: ' + 'あ'.repeat(400), addedLayers: ['NDVI'], addedCharts: 1 })
  assert.match(notice, /^【Claude 完了】/)
  assert.ok(!notice.includes('**'))
  assert.match(notice, /追加レイヤー: NDVI/)
  assert.match(notice, /チャート 1 件/)
  assert.ok(notice.length < 500)
  assert.match(buildCompletionNotice({ status: 'error', content: 'x' }), /終了: error/)
})

import { describeGrounding } from '../src/voice/voice-instruction.js'

test('enableSearch で検索ガイドが入り、groundingMetadata を 1 行にする', () => {
  assert.ok(!buildVoiceInstruction({ geeState: { status: 'ready' } }).includes('## Google 検索'))
  assert.match(buildVoiceInstruction({ geeState: { status: 'ready' }, enableSearch: true }), /## Google 検索/)
  const line = describeGrounding({ webSearchQueries: ['台風 2025 港'], groundingChunks: [{ web: { title: 'NHK', uri: 'https://nhk' } }] })
  assert.match(line, /検索: 台風 2025 港/)
  assert.match(line, /出典: NHK/)
  assert.equal(describeGrounding(null), '')
})
