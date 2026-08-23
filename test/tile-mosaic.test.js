// tile-mosaic（タイル範囲・結合・ジオ変換・GeoTIFF 書き出し）のテスト。
import test from 'node:test'
import assert from 'node:assert/strict'
import { fromArrayBuffer } from 'geotiff'
import { interleaveBands, mercatorGeoTransform, mosaicTiles, tileRangeForBounds, writeGeoTiff3857 } from '../src/gee/tile-mosaic.js'
import { MERCATOR_ORIGIN, TOP_RESOLUTION } from '../src/gee/tms.js'

test('tileRangeForBounds: 全球 z=1 は 2×2、関東 z=8 は数枚', () => {
  const all = tileRangeForBounds([-179.9, -85, 179.9, 85], 1)
  assert.equal(all.cols, 2)
  assert.equal(all.rows, 2)
  assert.equal(all.count, 4)
  const kanto = tileRangeForBounds([139.3, 35.3, 140.2, 36.0], 8)
  assert.ok(kanto.count >= 1 && kanto.count <= 6)
  assert.equal(kanto.z, 8)
})

test('mercatorGeoTransform: z=0 の原点と解像度', () => {
  const gt = mercatorGeoTransform({ xMin: 0, yMin: 0, z: 0 })
  assert.ok(Math.abs(gt.originX + MERCATOR_ORIGIN) < 1e-6)
  assert.ok(Math.abs(gt.originY - MERCATOR_ORIGIN) < 1e-6)
  assert.ok(Math.abs(gt.resolution - TOP_RESOLUTION) < 1e-6)
  const gt1 = mercatorGeoTransform({ xMin: 1, yMin: 1, z: 1 })
  assert.ok(Math.abs(gt1.originX) < 1e-6)
  assert.ok(Math.abs(gt1.originY) < 1e-6)
})

test('mosaicTiles: 2×1 タイルを結合し、欠けは nodata', () => {
  const size = 4
  const a = { index: { x: 10, y: 5 }, width: size, height: size, bands: [new Float32Array(size * size).fill(1)] }
  const b = { index: { x: 11, y: 5 }, width: size, height: size, bands: [new Float32Array(size * size).fill(2)] }
  const m = mosaicTiles([a, b], { xMin: 10, yMin: 5, cols: 3, rows: 1, tileSize: size, bandCount: 1, nodata: -1 })
  assert.equal(m.width, 12)
  assert.equal(m.height, 4)
  assert.equal(m.bands[0][0], 1)
  assert.equal(m.bands[0][5], 2)
  assert.equal(m.bands[0][9], -1)
  assert.deepEqual(Array.from(interleaveBands([new Float32Array([1, 2]), new Float32Array([3, 4])], 2, 1)), [1, 3, 2, 4])
})

test('writeGeoTiff3857 → geotiff.js で読み戻せる', async () => {
  const width = 4
  const height = 2
  const bands = [new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]), new Float32Array(8).fill(0.5)]
  const buf = await writeGeoTiff3857({ bands, width, height, originX: 1000, originY: 2000, resolution: 10, nodata: -999999, bandNames: ['a', 'b'] })
  const tiff = await fromArrayBuffer(buf)
  const img = await tiff.getImage()
  assert.equal(img.getWidth(), 4)
  assert.equal(img.getHeight(), 2)
  assert.equal(img.getSamplesPerPixel(), 2)
  assert.equal(img.getGDALNoData(), -999999)
  assert.deepEqual(img.getOrigin(), [1000, 2000, 0])
  assert.deepEqual(img.getResolution().slice(0, 2), [10, -10])
  assert.equal(img.getGeoKeys().ProjectedCSTypeGeoKey, 3857)
  const rasters = await img.readRasters()
  assert.deepEqual(Array.from(rasters[0]), [1, 2, 3, 4, 5, 6, 7, 8])
  assert.equal(rasters[1][3], 0.5)
})
