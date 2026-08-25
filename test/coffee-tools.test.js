// coffee_list_monitors / coffee_show_regions のハンドラ（deps 注入）のテスト。
import test from 'node:test'
import assert from 'node:assert/strict'
import { makeCoffeeHandlers } from '../src/tools/coffee/handlers.js'
import { TOOL_RESULT_CHAR_CAP } from '../src/agent/runtime.js'

function makeDeps() {
  const layers = []
  const fits = []
  const deps = {
    addVectorLayer: (l) => { layers.push(l); return { layerId: 'L1', name: l.name } },
    fitBounds: (b) => fits.push(b),
    session: { originPrompt: 'test' },
    log: () => {},
    now: () => new Date(2026, 6, 15),
  }
  return { deps, layers, fits }
}

test('coffee_list_monitors は現在月のジョブと bbox・profiles を返す', async () => {
  const { deps } = makeDeps()
  const h = makeCoffeeHandlers(deps)
  const res = await h.listMonitors({})
  assert.equal(res.month, 7)
  assert.equal(res.count, res.monitors.length)
  const frost = res.monitors.find((m) => m.id === 'BR_FROST')
  assert.ok(frost)
  assert.equal(frost.priority, 'critical')
  assert.equal(frost.regions.length, 4)
  assert.equal(frost.regions[0].region.type, 'bbox')
  assert.equal(frost.regions[0].region.bounds.length, 4)
  assert.ok(res.profiles.frost)
  assert.ok(res.profiles.frost.datasets[0].id.startsWith('ECMWF/ERA5_LAND'))
  assert.equal(res.hint, undefined)

  const noProfiles = await h.listMonitors({ month: 9, include_profiles: false })
  assert.deepEqual(noProfiles.profiles, {})
  assert.equal(noProfiles.month, 9)

  const none = await h.listMonitors({ month: 5, risk: 'frost' })
  assert.equal(none.count, 0)
  assert.match(none.hint, /監視ジョブはありません/)
  await assert.rejects(() => h.listMonitors({ month: 13 }))
})

test('coffee_list_monitors の結果は最大月でもツール結果キャップに収まる', async () => {
  const h = makeCoffeeHandlers(makeDeps().deps)
  for (let m = 1; m <= 12; m++) {
    const res = await h.listMonitors({ month: m })
    assert.ok(JSON.stringify(res).length < TOOL_RESULT_CHAR_CAP, `month ${m}: ${JSON.stringify(res).length}`)
  }
})

test('coffee_show_regions はポリゴンのベクターレイヤーを追加して fitBounds する', async () => {
  const { deps, layers, fits } = makeDeps()
  const h = makeCoffeeHandlers(deps)
  const res = await h.showRegions({ country: 'Brazil' })
  assert.equal(layers.length, 1)
  assert.equal(layers[0].name, 'コーヒー産地')
  assert.equal(layers[0].geojson.features.length, 5)
  assert.equal(layers[0].geojson.features[0].geometry.type, 'Polygon')
  assert.equal(layers[0].geomType, 'Polygon')
  assert.deepEqual(layers[0].style.color, [111, 78, 55])
  assert.equal(layers[0].originPrompt, 'test')
  assert.equal(fits.length, 1)
  assert.equal(res.layerId, 'L1')
  assert.equal(res.featureCount, 5)
  assert.equal(res.regions.length, 5)

  await h.showRegions({ region_ids: ['CO_CENTRAL'], fit_bounds: false, color: [1, 2, 3], name: 'CO' })
  assert.equal(fits.length, 1)
  assert.deepEqual(layers[1].style.color, [1, 2, 3])
  assert.equal(layers[1].name, 'CO')
  await assert.rejects(() => h.showRegions({ region_ids: ['NOPE'] }), /未知の産地 ID/)
})
