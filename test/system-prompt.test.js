// SOURCES の整合性（ツール名一意・スキル非空・スキーマ形）とシステムプロンプトのテスト。
import test from 'node:test'
import assert from 'node:assert/strict'
import { ToolRegistry } from '../src/agent/tool-registry.js'
import { composeSystemPrompt, BASE_SYSTEM_PROMPT } from '../src/agent/system-prompt.js'
import { SOURCES } from '../src/tools/sources.js'
import { createToolRegistry } from '../src/tools/register-tools.js'

const fakeDeps = {
  geeClient: { assertReady: () => { throw new Error('no') } },
  datasetStore: {},
  layerStore: { list: () => [], get: () => null },
  chartStore: {},
  session: {},
  log: () => {},
}

test('全ソースのツール名が一意で、スキーマ形式が揃っている', () => {
  const registry = createToolRegistry(fakeDeps)
  const defs = registry.definitions()
  const names = defs.map((d) => d.name)
  assert.equal(new Set(names).size, names.length)
  for (const d of defs) {
    assert.ok(d.description.length > 10, d.name)
    assert.equal(d.input_schema.type, 'object', d.name)
  }
  assert.ok(names.includes('ee_add_layer'))
  assert.ok(names.includes('show_chart'))
  assert.ok(names.includes('portwatch_fetch_metrics'))
  assert.ok(registry instanceof ToolRegistry)
})

test('スキルは非空で BASE の後ろに連結される', () => {
  for (const s of SOURCES) for (const skill of s.skills) assert.ok(skill.trim().length > 50, s.id)
  const prompt = composeSystemPrompt()
  assert.ok(prompt.startsWith(BASE_SYSTEM_PROMPT.trim()))
  assert.match(prompt, /スキル: IMF PortWatch/)
  assert.match(prompt, /スキル: Earth Engine コードの書き方/)
  assert.match(prompt, /スキル: Google Earth Engine データセット/)
  assert.match(prompt, /NOAA\/CFSR_HARMONIZED/)
  assert.match(prompt, /NASA\/GPM_L3\/IMERG_V07/)
  assert.match(prompt, /Tiba/)
  assert.match(prompt, /2–98 パーセンタイル/)
})

import { buildSystemBlocks, formatNow } from '../src/agent/system-context.js'

test('system の揮発ブロックに現在日時が入り、日付の自己判断を禁じる', () => {
  const blocks = buildSystemBlocks({ layers: [], datasets: [], geeState: { status: 'idle' }, now: new Date(2026, 7, 23, 14, 5) })
  assert.equal(blocks.length, 2)
  assert.match(blocks[1].text, /## 現在日時\n2026-08-23（日）14:05/)
  assert.match(blocks[1].text, /未来\/過去を判断しない/)
  assert.match(formatNow(new Date(2026, 0, 5, 9, 30)), /^2026-01-05（月）09:30 ローカル時刻（UTC[+-]\d+）$/)
  assert.match(BASE_SYSTEM_PROMPT, /日付の扱い/)
})
