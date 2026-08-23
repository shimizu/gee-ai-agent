// tools/shared/summarize のテスト。
import test from 'node:test'
import assert from 'node:assert/strict'
import { capValue, featureCollectionToRows, geojsonBounds, geojsonSummary, isRowArray, rowsToPointFeatureCollection } from '../src/tools/shared/summarize.js'

test('FeatureCollection ↔ rows', () => {
  const fc = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] }, properties: { n: 'a' } }] }
  const rows = featureCollectionToRows(fc)
  assert.deepEqual(rows, [{ n: 'a', lon: 1, lat: 2, id: 0 }])
  const back = rowsToPointFeatureCollection(rows)
  assert.equal(back.features.length, 1)
  assert.deepEqual(geojsonBounds(back), [1, 2, 1, 2])
  assert.equal(geojsonSummary(fc).geomType, 'Point')
  assert.ok(isRowArray(rows))
  assert.ok(!isRowArray([1, 2]))
})

test('capValue は大きい値を打ち切る', () => {
  const big = 'x'.repeat(10000)
  const r = capValue(big, 100)
  assert.equal(r.truncated, true)
  assert.equal(r.preview.length, 100)
  assert.deepEqual(capValue({ a: 1 }), { a: 1 })
})
