// データセット（表形式の行データ）のブラウザ内ストア。
//
// 役割: GEE の時系列・PortWatch の取得結果・FeatureCollection の評価結果など、行データを
//       LLM の会話に入れずに datasetId で参照させる。要約は localStorage、行は IndexedDB。
// 関係: tools/* が add / get / inspect / list を呼ぶ。useDatasetActions が購読する。
// 流用元: reference/portwatch-dashboard/src/data/dataset-store.js（source 汎用化・meta 追加）
import { idbClear, idbDelete, idbGetAll, idbPut, STORES } from './idb.js'

const STORAGE_KEY = 'gee-agent.datasets'

function resolveStorage(storage) {
  if (storage) return storage
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

// 列名を推定する（先頭 200 行のキーの和集合）。
export function inferColumns(records) {
  const cols = new Set()
  for (const r of records.slice(0, 200)) {
    if (r && typeof r === 'object') for (const k of Object.keys(r)) cols.add(k)
  }
  return [...cols]
}

// 日付らしい列（date / time / system:time_start 等）を探して範囲を返す。
export function dateRangeOf(records, dateColumn) {
  const col = dateColumn ?? guessDateColumn(records)
  if (!col) return null
  const values = records.map((r) => r?.[col]).filter((v) => v != null && v !== '')
  if (!values.length) return null
  const sorted = values.map(String).sort()
  return { column: col, from: sorted[0], to: sorted.at(-1) }
}

export function guessDateColumn(records) {
  const first = records.find((r) => r && typeof r === 'object')
  if (!first) return null
  const keys = Object.keys(first)
  return keys.find((k) => /^(date|time|datetime|timestamp|system:time_start|year_month|month)$/i.test(k)) ?? null
}

function summarize(dataset) {
  return {
    id: dataset.id,
    title: dataset.title,
    source: dataset.source,
    meta: dataset.meta ?? null,
    recordCount: dataset.records.length,
    columns: dataset.columns,
    dateRange: dataset.dateRange ?? null,
    createdAt: dataset.createdAt,
  }
}

function sequenceFromId(id) {
  const m = /^ds_(\d+)$/.exec(id ?? '')
  return m ? Number(m[1]) : 0
}

export class DatasetStore {
  #datasets = new Map()
  #summaries = new Map()
  #listeners = new Set()
  #sequence = 0
  #storage
  #snapshot = []

  constructor({ storage, hydrate = true } = {}) {
    this.#storage = resolveStorage(storage)
    this.#restore()
    this.#snapshot = this.#buildSnapshot()
    if (hydrate) this.#hydrate()
  }

  // { title, source, records, columns?, meta?, dateColumn? } → 保存済みデータセット
  add({ title, source = 'unknown', records, columns, meta = null, dateColumn, geojson = null }) {
    if (!Array.isArray(records)) throw new Error('records は配列である必要があります。')
    this.#sequence += 1
    const id = `ds_${String(this.#sequence).padStart(3, '0')}`
    const stored = {
      id,
      title: title || id,
      source,
      meta,
      records,
      geojson,
      columns: columns ?? inferColumns(records),
      dateRange: dateRangeOf(records, dateColumn),
      createdAt: new Date().toISOString(),
    }
    this.#datasets.set(id, stored)
    this.#summaries.set(id, summarize(stored))
    this.#persist()
    idbPut(STORES.datasets, stored).catch(() => {})
    this.#notify()
    return stored
  }

  get(id) {
    const ds = this.#datasets.get(id)
    if (!ds) {
      if (this.#summaries.has(id)) {
        throw new Error(`データセット ${id} の行データが読み込まれていません（復元中か、消去済み）。再取得してください。`)
      }
      throw new Error(`データセットが見つかりません: ${id}`)
    }
    return ds
  }

  has(id) {
    return this.#datasets.has(id)
  }

  list() {
    return this.#snapshot
  }

  inspect(id, { sampleSize = 5, distinctColumn } = {}) {
    const ds = this.get(id)
    const result = { ...summarize(ds), sample: ds.records.slice(0, Math.min(Math.max(sampleSize, 0), 20)) }
    if (distinctColumn) {
      if (!ds.columns.includes(distinctColumn)) throw new Error(`列が見つかりません: ${distinctColumn}`)
      result.distinct = [...new Set(ds.records.map((r) => r[distinctColumn]))].slice(0, 100)
    }
    return result
  }

  remove(id) {
    const had = this.#datasets.delete(id) | this.#summaries.delete(id)
    if (!had) return
    this.#persist()
    idbDelete(STORES.datasets, id).catch(() => {})
    this.#notify()
  }

  clear() {
    this.#datasets.clear()
    this.#summaries.clear()
    this.#sequence = 0
    try {
      this.#storage?.removeItem(STORAGE_KEY)
    } catch {
      // 無視
    }
    idbClear(STORES.datasets).catch(() => {})
    this.#notify()
  }

  // useSyncExternalStore 用。
  subscribe = (listener) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  getSnapshot = () => this.#snapshot

  #buildSnapshot() {
    return [...this.#summaries.values()].map((s) => ({ ...s, available: this.#datasets.has(s.id) }))
  }

  #restore() {
    let summaries
    try {
      const raw = this.#storage?.getItem(STORAGE_KEY)
      summaries = raw ? JSON.parse(raw) : []
    } catch {
      summaries = []
    }
    if (!Array.isArray(summaries)) return
    for (const s of summaries) {
      if (!s?.id) continue
      this.#summaries.set(s.id, s)
      this.#sequence = Math.max(this.#sequence, sequenceFromId(s.id))
    }
  }

  async #hydrate() {
    let datasets
    try {
      datasets = await idbGetAll(STORES.datasets)
    } catch {
      return
    }
    if (!Array.isArray(datasets) || datasets.length === 0) return
    for (const ds of datasets) {
      if (!ds?.id) continue
      this.#datasets.set(ds.id, ds)
      if (!this.#summaries.has(ds.id)) this.#summaries.set(ds.id, summarize(ds))
      this.#sequence = Math.max(this.#sequence, sequenceFromId(ds.id))
    }
    this.#notify()
  }

  #persist() {
    try {
      this.#storage?.setItem(STORAGE_KEY, JSON.stringify([...this.#summaries.values()]))
    } catch {
      // quota 超過などで保存に失敗してもメモリ保持は継続する。
    }
  }

  #notify() {
    this.#snapshot = this.#buildSnapshot()
    for (const l of this.#listeners) l()
  }
}
