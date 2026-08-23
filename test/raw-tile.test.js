// computePixels タイル取得（リクエスト本文・復号）のテスト。fetchImpl 注入。
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildComputePixelsBody, fetchComputePixelsTile } from '../src/gee/raw-tile.js'
import { tileAffineTransform, MERCATOR_ORIGIN, TOP_RESOLUTION } from '../src/gee/tms.js'
import { writeGeoTiff3857 } from '../src/gee/tile-mosaic.js'

test('tileAffineTransform: z=0 は全球、z=1 の (1,0) は原点が 0', () => {
  const a0 = tileAffineTransform({ x: 0, y: 0, z: 0 })
  assert.ok(Math.abs(a0.translateX + MERCATOR_ORIGIN) < 1e-6)
  assert.ok(Math.abs(a0.translateY - MERCATOR_ORIGIN) < 1e-6)
  assert.ok(Math.abs(a0.scaleX - TOP_RESOLUTION) < 1e-6)
  assert.ok(Math.abs(a0.scaleY + TOP_RESOLUTION) < 1e-6)
  const a1 = tileAffineTransform({ x: 1, y: 0, z: 1 })
  assert.ok(Math.abs(a1.translateX) < 1e-6)
  assert.equal(a1.shearX, 0)
})

test('buildComputePixelsBody は grid/crs/bandIds を組む', () => {
  const body = buildComputePixelsBody({ expression: { values: {}, result: '0' }, bandIds: ['a'], affine: tileAffineTransform({ x: 0, y: 0, z: 0 }) })
  assert.equal(body.fileFormat, 'GEO_TIFF')
  assert.deepEqual(body.bandIds, ['a'])
  assert.equal(body.grid.crsCode, 'EPSG:3857')
  assert.deepEqual(body.grid.dimensions, { width: 256, height: 256 })
})

test('fetchComputePixelsTile: POST して GeoTIFF を復号、認証なし/HTTP エラーは例外', async () => {
  const data = new Float32Array(4 * 4).map((_, i) => i * 1.5)
  const tiff = await writeGeoTiff3857({ bands: [data], width: 4, height: 4, originX: 0, originY: 0, resolution: 1, nodata: -999999 })
  let seen
  const fetchImpl = async (url, init) => {
    seen = { url, method: init.method, auth: init.headers.authorization, body: JSON.parse(init.body) }
    return { ok: true, status: 200, arrayBuffer: async () => tiff }
  }
  const r = await fetchComputePixelsTile({ project: 'p1', expression: { values: {}, result: '0' }, bandIds: ['a'], affine: tileAffineTransform({ x: 0, y: 0, z: 0 }), authHeader: 'Bearer t', fetchImpl, tileSize: 4 })
  assert.match(seen.url, /projects\/p1\/image:computePixels$/)
  assert.equal(seen.method, 'POST')
  assert.equal(seen.auth, 'Bearer t')
  assert.equal(seen.body.grid.dimensions.width, 4)
  assert.equal(r.width, 4)
  assert.equal(r.bands[0][3], 4.5)
  assert.equal(r.sampleFormat, 3)
  await assert.rejects(fetchComputePixelsTile({ project: 'p1', expression: {}, bandIds: ['a'], affine: {}, authHeader: null }), /認証/)
  const bad = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'bad grid' } }) })
  await assert.rejects(fetchComputePixelsTile({ project: 'p1', expression: {}, bandIds: ['a'], affine: {}, authHeader: 'Bearer t', fetchImpl: bad }), /400: bad grid/)
})
