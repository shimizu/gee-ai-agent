// export-service（getDownloadURL パラメータとサイズ推定）のテスト。
import test from 'node:test'
import assert from 'node:assert/strict'
import { boundsToPolygon, buildDownloadParams, estimateDownloadBytes, normalizeCrs, DOWNLOAD_LIMIT_BYTES } from '../src/gee/export-service.js'

test('buildDownloadParams は region を Polygon 化し既定値を埋める', () => {
  const p = buildDownloadParams({ name: 'NDVI 2024', bounds: [139, 35, 140, 36], scale: 30, bands: ['NDVI'] })
  assert.equal(p.format, 'GEO_TIFF')
  assert.equal(p.filePerBand, false)
  assert.equal(p.crs, 'EPSG:4326')
  assert.equal(p.scale, 30)
  assert.deepEqual(p.bands, ['NDVI'])
  assert.equal(p.region.type, 'Polygon')
  assert.deepEqual(p.region.coordinates[0][0], [139, 35])
  assert.match(p.name, /^NDVI_2024$/)
})

test('不正な引数はエラー', () => {
  assert.throws(() => buildDownloadParams({ bounds: [1, 2, 3], scale: 10 }), /bounds/)
  assert.throws(() => buildDownloadParams({ bounds: [2, 2, 1, 3], scale: 10 }), /east > west/)
  assert.throws(() => buildDownloadParams({ bounds: [0, 0, 1, 1], scale: 0 }), /scale/)
  assert.throws(() => normalizeCrs('EPSG:32654'), /crs/)
  assert.equal(normalizeCrs('3857'), 'EPSG:3857')
  assert.equal(boundsToPolygon([0, 0, 1, 1]).coordinates[0].length, 5)
})

test('estimateDownloadBytes は上限超過で scale を提案する', () => {
  const small = estimateDownloadBytes({ bounds: [139, 35, 139.1, 35.1], scale: 100, bandCount: 1 })
  assert.equal(small.overLimit, false)
  assert.ok(small.pixels > 0 && small.bytes === small.pixels * 4)
  const big = estimateDownloadBytes({ bounds: [130, 30, 145, 45], scale: 10, bandCount: 3 })
  assert.equal(big.overLimit, true)
  assert.ok(big.suggestedScale > 10)
  const retry = estimateDownloadBytes({ bounds: [130, 30, 145, 45], scale: big.suggestedScale, bandCount: 3 })
  assert.equal(retry.overLimit, false)
  assert.ok(retry.bytes <= DOWNLOAD_LIMIT_BYTES)
  // 3857 は高緯度で大きくなる
  const m4326 = estimateDownloadBytes({ bounds: [10, 60, 11, 61], scale: 100 })
  const m3857 = estimateDownloadBytes({ bounds: [10, 60, 11, 61], scale: 100, crs: 'EPSG:3857' })
  assert.ok(m3857.pixels > m4326.pixels)
})
