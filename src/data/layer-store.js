// レイヤー描画状態ストア（UI 状態の単一の真実）。
//
// 役割: 地図に表示する各レイヤー（EE ラスター / ベクター）の spec と描画ランタイムを保持し、
//       変更を購読者（React）へ通知する。spec だけを永続化し、runtime（タイル URL・
//       getTileData）は復元時に layer-factory で作り直す。
// 関係: hooks/useLayerActions.js が所有。Layers/index.js が描画に使う。
//
// レイヤーオブジェクトの形:
//   raster: { layerId, kind:'ee-raster', name, visible, opacity, spec:{ code, mode, vis, bands,
//             colormap, colormapReversed, rescale, bandMath, nodata }, bandNames, originPrompt,
//             createdAt, runtime:{ status, urlFormat, getTileData, error, ... } }
//   vector: { layerId, kind:'vector', name, visible, opacity, geojson, geomType, featureCount,
//             bounds, style:{ color, radius, lineWidth }, originPrompt, createdAt }
// 流用元: reference/web-gis-ai-agent/src/data/layer-store.js（undo/redo を省き永続化を追加）
import { idbClear, idbDelete, idbGetAll, idbPut, STORES } from './idb.js'
import { nextSequenceId } from '../utils/ids.js'

const STORAGE_KEY = 'gee-agent.layers'

const PALETTE = [
  [255, 140, 0],
  [0, 122, 255],
  [52, 199, 89],
  [175, 82, 222],
  [255, 45, 85],
  [255, 204, 0],
]

function resolveStorage(storage) {
  if (storage) return storage
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

// 永続化用に runtime と大きな geojson を落とす。
export function toPersistable(layer) {
  const { runtime, geojson, ...rest } = layer
  void runtime
  void geojson
  return rest
}

export class LayerStore {
  #layers = []
  #listeners = new Set()
  #storage

  constructor({ storage, hydrate = true } = {}) {
    this.#storage = resolveStorage(storage)
    this.#layers = this.#restore()
    if (hydrate) this.#hydrateVectors()
  }

  subscribe = (listener) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  getSnapshot = () => this.#layers

  nextColor() {
    return PALETTE[this.#layers.length % PALETTE.length]
  }

  nextId() {
    return nextSequenceId('lyr', this.#layers.map((l) => l.layerId))
  }

  get(layerId) {
    return this.#layers.find((l) => l.layerId === layerId) ?? null
  }

  list() {
    return this.#layers
  }

  add(layer) {
    this.#commit([...this.#layers, layer])
    if (layer.kind === 'vector' && layer.geojson) {
      idbPut(STORES.layers, { id: layer.layerId, geojson: layer.geojson }).catch(() => {})
    }
  }

  update(layerId, patch) {
    this.#commit(this.#layers.map((l) => (l.layerId === layerId ? { ...l, ...patch } : l)))
  }

  // spec の部分更新（raw の colormap/rescale など）。
  updateSpec(layerId, specPatch) {
    const layer = this.get(layerId)
    if (!layer) return
    this.update(layerId, { spec: { ...layer.spec, ...specPatch } })
  }

  remove(layerId) {
    const layer = this.get(layerId)
    if (!layer) return null
    this.#commit(this.#layers.filter((l) => l.layerId !== layerId))
    idbDelete(STORES.layers, layerId).catch(() => {})
    return layer
  }

  toggle(layerId) {
    const layer = this.get(layerId)
    if (layer) this.update(layerId, { visible: !layer.visible })
  }

  clear() {
    this.#commit([])
    idbClear(STORES.layers).catch(() => {})
  }

  #commit(next) {
    this.#layers = next
    this.#persist()
    for (const l of this.#listeners) l()
  }

  #restore() {
    try {
      const raw = this.#storage?.getItem(STORAGE_KEY)
      const parsed = raw ? JSON.parse(raw) : []
      if (!Array.isArray(parsed)) return []
      // ラスターは runtime 無し（loading 扱い）で復元し、useLayerActions が再作成する。
      return parsed.map((l) => (l.kind === 'ee-raster' ? { ...l, runtime: { status: 'restoring' } } : l))
    } catch {
      return []
    }
  }

  async #hydrateVectors() {
    let rows
    try {
      rows = await idbGetAll(STORES.layers)
    } catch {
      return
    }
    if (!Array.isArray(rows) || rows.length === 0) return
    const byId = new Map(rows.map((r) => [r.id, r.geojson]))
    let changed = false
    const next = this.#layers.map((l) => {
      if (l.kind === 'vector' && !l.geojson && byId.has(l.layerId)) {
        changed = true
        return { ...l, geojson: byId.get(l.layerId) }
      }
      return l
    })
    if (changed) this.#commit(next)
  }

  #persist() {
    try {
      this.#storage?.setItem(STORAGE_KEY, JSON.stringify(this.#layers.map(toPersistable)))
    } catch {
      // 保存失敗は無視（メモリ上は維持）。
    }
  }
}
