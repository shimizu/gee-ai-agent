// LayerStore（永続化に runtime を含めない）のテスト。
import test from 'node:test'
import assert from 'node:assert/strict'
import { LayerStore, toPersistable } from '../src/data/layer-store.js'

function memStorage() {
  const m = new Map()
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }
}

test('add / update / updateSpec / remove と永続化', () => {
  const storage = memStorage()
  const store = new LayerStore({ storage, hydrate: false })
  const id = store.nextId()
  assert.equal(id, 'lyr_001')
  store.add({ layerId: id, kind: 'ee-raster', name: 'n', visible: true, spec: { mode: 'raw', colormap: 'viridis' }, runtime: { status: 'ready', getTileData: () => {} } })
  store.updateSpec(id, { colormap: 'magma' })
  assert.equal(store.get(id).spec.colormap, 'magma')
  const saved = JSON.parse(storage.getItem('gee-agent.layers'))
  assert.equal(saved[0].runtime, undefined)
  const restored = new LayerStore({ storage, hydrate: false })
  assert.equal(restored.get(id).runtime.status, 'restoring')
  assert.equal(restored.nextId(), 'lyr_002')
  store.remove(id)
  assert.equal(store.list().length, 0)
})

test('toPersistable は runtime と geojson を落とす', () => {
  assert.deepEqual(toPersistable({ a: 1, runtime: {}, geojson: {} }), { a: 1 })
})
