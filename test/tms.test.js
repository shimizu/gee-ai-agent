// WebMercatorQuad TMS と座標変換のテスト。
import test from 'node:test'
import assert from 'node:assert/strict'
import { createWebMercatorQuadTms, lngLatToMercator, mercatorToLngLat, MERCATOR_ORIGIN, TOP_RESOLUTION } from '../src/gee/tms.js'

test('TMS の各レベルは 2^z 行列・cellSize は半減', () => {
  const tms = createWebMercatorQuadTms({ maxZoom: 5 })
  assert.equal(tms.tileMatrices.length, 6)
  assert.equal(tms.tileMatrices[0].cellSize, TOP_RESOLUTION)
  assert.equal(tms.tileMatrices[3].matrixWidth, 8)
  assert.ok(Math.abs(tms.tileMatrices[1].cellSize * 2 - TOP_RESOLUTION) < 1e-9)
  assert.deepEqual(tms.tileMatrices[0].pointOfOrigin, [-MERCATOR_ORIGIN, MERCATOR_ORIGIN])
})

test('lngLat ↔ mercator の往復', () => {
  const [x, y] = lngLatToMercator(139.7, 35.6)
  const [lng, lat] = mercatorToLngLat(x, y)
  assert.ok(Math.abs(lng - 139.7) < 1e-9)
  assert.ok(Math.abs(lat - 35.6) < 1e-9)
  assert.ok(Math.abs(lngLatToMercator(180, 0)[0] - MERCATOR_ORIGIN) < 1e-6)
})
