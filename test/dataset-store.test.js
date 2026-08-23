// DatasetStore（要約と行データ、storage 注入）のテスト。IndexedDB 無しで動く。
import test from 'node:test'
import assert from 'node:assert/strict'
import { DatasetStore, inferColumns, dateRangeOf } from '../src/data/dataset-store.js'

function memStorage() {
  const m = new Map()
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }
}

test('add → get / list / inspect / remove', () => {
  const store = new DatasetStore({ storage: memStorage(), hydrate: false })
  const ds = store.add({ title: 't', source: 'gee', records: [{ date: '2024-01-02', v: 1 }, { date: '2024-01-01', v: 2 }] })
  assert.equal(ds.id, 'ds_001')
  assert.deepEqual(ds.columns, ['date', 'v'])
  assert.deepEqual(ds.dateRange, { column: 'date', from: '2024-01-01', to: '2024-01-02' })
  assert.equal(store.list()[0].recordCount, 2)
  assert.equal(store.inspect('ds_001', { sampleSize: 1 }).sample.length, 1)
  assert.deepEqual(store.inspect('ds_001', { distinctColumn: 'v' }).distinct, [1, 2])
  assert.throws(() => store.get('ds_999'), /見つかりません/)
  store.remove('ds_001')
  assert.equal(store.list().length, 0)
})

test('要約は storage から復元され、連番が継続する', () => {
  const storage = memStorage()
  const a = new DatasetStore({ storage, hydrate: false })
  a.add({ title: 'x', records: [{ a: 1 }] })
  const b = new DatasetStore({ storage, hydrate: false })
  assert.equal(b.list().length, 1)
  assert.equal(b.list()[0].available, false)
  assert.equal(b.add({ title: 'y', records: [{ a: 1 }] }).id, 'ds_002')
})

test('inferColumns / dateRangeOf', () => {
  assert.deepEqual(inferColumns([{ a: 1 }, { b: 2 }]), ['a', 'b'])
  assert.equal(dateRangeOf([{ x: 1 }]), null)
})
