// packBands（バンド配列 → テクスチャデータ）のテスト。
import test from 'node:test'
import assert from 'node:assert/strict'
import { packBands } from '../src/gee/raster-texture.js'

test('1 バンドは r32float のまま', () => {
  const b = new Float32Array([1, 2, 3, 4])
  const p = packBands([b], 2, 2)
  assert.equal(p.format, 'r32float')
  assert.equal(p.channels, 1)
  assert.equal(p.data, b)
})

test('2 バンドは rgba32float にインターリーブ（alpha=1, 欠けは 0）', () => {
  const p = packBands([new Float32Array([1, 2]), new Float32Array([3, 4])], 2, 1)
  assert.equal(p.format, 'rgba32float')
  assert.equal(p.channels, 2)
  assert.deepEqual(Array.from(p.data), [1, 3, 0, 1, 2, 4, 0, 1])
})

test('長さ不一致・5 バンドはエラー', () => {
  assert.throws(() => packBands([new Float32Array(3)], 2, 2), /不一致/)
  assert.throws(() => packBands(Array.from({ length: 5 }, () => new Float32Array(1)), 1, 1), /最大 4/)
})

import { statScaleForBounds, resolveVisBands } from '../src/gee/layer-factory.js'

test('statScaleForBounds は表示幅 ~512 画素分の scale（下限 30m）', () => {
  assert.equal(statScaleForBounds(null), 1000)
  assert.ok(statScaleForBounds([139, 35, 139.01, 35.01]) === 30)
  const wide = statScaleForBounds([130, 30, 145, 45])
  assert.ok(wide > 2000 && wide < 3000, String(wide))
  assert.deepEqual(resolveVisBands({ vis: { bands: ['B4', 'B3', 'B2'] } }, ['B2', 'B3', 'B4']), ['B4'])
  assert.deepEqual(resolveVisBands({ vis: {} }, ['NDVI']), ['NDVI'])
})
