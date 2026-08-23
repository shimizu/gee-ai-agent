// region 引数の正規化テスト。
import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeRegion } from '../src/tools/shared/region.js'

test('各形式を正規化する', () => {
  assert.deepEqual(normalizeRegion('map_view'), { type: 'map_view' })
  assert.deepEqual(normalizeRegion([1, 2, 3, 4]), { type: 'bbox', bounds: [1, 2, 3, 4] })
  assert.deepEqual(normalizeRegion({ type: 'point', lon: 1, lat: 2, buffer_m: 500 }), { type: 'point', lon: 1, lat: 2, buffer_m: 500 })
  const g = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }
  assert.deepEqual(normalizeRegion(g), { type: 'geojson', geometry: g })
  assert.deepEqual(normalizeRegion({ type: 'Feature', geometry: g, properties: {} }), { type: 'geojson', geometry: g })
  assert.equal(normalizeRegion(null), null)
})

test('不正な形式はエラー', () => {
  assert.throws(() => normalizeRegion([1, 2]), /west, south/)
  assert.throws(() => normalizeRegion({ type: 'point', lon: 'x' }), /lon, lat/)
  assert.throws(() => normalizeRegion({ type: 'what' }), /未知/)
})
