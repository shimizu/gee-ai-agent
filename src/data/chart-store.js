// チャートストア。
//
// 役割: show_chart で作られたチャート（spec + 行スナップショット）を保持し、チャット内カード
//       と拡大ダイアログから chartId で参照させる。localStorage に永続化（行数上限あり）。
// 関係: tools/chart/handlers.js が add、ChatPanel/ChartCard/ChartDialog が参照。
import { nextSequenceId } from '../utils/ids.js'

const STORAGE_KEY = 'gee-agent.charts'

function resolveStorage(storage) {
  if (storage) return storage
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export class ChartStore {
  #charts = []
  #listeners = new Set()
  #storage

  constructor({ storage } = {}) {
    this.#storage = resolveStorage(storage)
    this.#charts = this.#restore()
  }

  subscribe = (listener) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  getSnapshot = () => this.#charts

  get(chartId) {
    return this.#charts.find((c) => c.chartId === chartId) ?? null
  }

  list() {
    return this.#charts
  }

  add({ spec, rows, datasetId = null }) {
    const chartId = nextSequenceId('chart', this.#charts.map((c) => c.chartId))
    const chart = { chartId, spec, rows, datasetId, createdAt: new Date().toISOString() }
    this.#commit([...this.#charts, chart])
    return chart
  }

  remove(chartId) {
    this.#commit(this.#charts.filter((c) => c.chartId !== chartId))
  }

  clear() {
    this.#commit([])
  }

  #commit(next) {
    this.#charts = next
    this.#persist()
    for (const l of this.#listeners) l()
  }

  #restore() {
    try {
      const raw = this.#storage?.getItem(STORAGE_KEY)
      const parsed = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  #persist() {
    try {
      this.#storage?.setItem(STORAGE_KEY, JSON.stringify(this.#charts))
    } catch {
      // quota 超過時は古いチャートから落として再試行する。
      try {
        const trimmed = this.#charts.slice(-5)
        this.#storage?.setItem(STORAGE_KEY, JSON.stringify(trimmed))
      } catch {
        // 諦める（メモリ上は保持）。
      }
    }
  }
}
