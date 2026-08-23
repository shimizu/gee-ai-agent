// raw タイルの CPU 側キャッシュ（ホバーで実値を返すため）。
//
// 役割: レイヤー ID ごとに "z/x/y" → 復号済みタイルを保持する。TileLayer の onTileUnload で
//       破棄し、メモリを抑える。
// 関係: layer-factory.js が set、Layers/index.js の onTileUnload が delete、useMapHover が get。
import { tileKey } from './pixel-pick.js'

export class RawTileCache {
  #layers = new Map()

  set(layerId, index, tile) {
    let m = this.#layers.get(layerId)
    if (!m) {
      m = new Map()
      this.#layers.set(layerId, m)
    }
    m.set(tileKey(index), tile)
  }

  delete(layerId, index) {
    this.#layers.get(layerId)?.delete(tileKey(index))
  }

  getLayer(layerId) {
    return this.#layers.get(layerId) ?? null
  }

  clearLayer(layerId) {
    this.#layers.delete(layerId)
  }

  clear() {
    this.#layers.clear()
  }
}
