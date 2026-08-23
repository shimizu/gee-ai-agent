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
})
