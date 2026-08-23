// 経緯度 → タイル/画素とキャッシュ参照のテスト。
import test from 'node:test'
import assert from 'node:assert/strict'
import { pickValue, tileAndPixel, tileKey } from '../src/gee/pixel-pick.js'

test('z=0 は常に 0/0、z=1 の東京は x=1,y=0', () => {
  const t0 = tileAndPixel(139.7, 35.6, 0)
  assert.equal(t0.x, 0)
  assert.equal(t0.y, 0)
  const t1 = tileAndPixel(139.7, 35.6, 1)
  assert.equal(t1.x, 1)
  assert.equal(t1.y, 0)
  assert.ok(t1.px >= 0 && t1.px < 256)
})

test('pickValue は preferZoom から降順に探し nodata を判定する', () => {
  const cache = new Map()
  const bands = [new Float32Array(256 * 256).fill(7)]
  cache.set(tileKey({ x: 0, y: 0, z: 0 }), { width: 256, height: 256, bands, nodata: -999 })
  const r = pickValue(cache, 139.7, 35.6, { preferZoom: 5 })
  assert.equal(r.z, 0)
  assert.deepEqual(r.values, [7])
  assert.equal(r.isNoData, false)
  bands[0].fill(-999)
  assert.equal(pickValue(cache, 139.7, 35.6, { preferZoom: 0 }).isNoData, true)
  assert.equal(pickValue(new Map(), 0, 0, {}), null)
})
