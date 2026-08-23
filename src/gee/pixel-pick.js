// 経緯度 → タイル索引・画素位置の計算と、タイルキャッシュからの実値参照（純関数）。
//
// 役割: raw レイヤーのホバーで、表示中ズームに近いタイルの Float32Array から画素値を引く。
// 関係: hooks/useMapHover.js が tile-cache.js のキャッシュと組み合わせて使う。
const MAX_LAT = 85.05112878

// WebMercator タイル座標（z/x/y）と、そのタイル内の画素位置（px/py）を返す。
export function tileAndPixel(lng, lat, z, tileSize = 256) {
  const n = 2 ** z
  const clampedLat = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat))
  const latRad = (clampedLat * Math.PI) / 180
  const xf = ((lng + 180) / 360) * n
  const yf = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  const x = Math.floor(xf)
  const y = Math.floor(yf)
  const px = Math.min(tileSize - 1, Math.max(0, Math.floor((xf - x) * tileSize)))
  const py = Math.min(tileSize - 1, Math.max(0, Math.floor((yf - y) * tileSize)))
  return { x: ((x % n) + n) % n, y: Math.min(n - 1, Math.max(0, y)), z, px, py }
}

export function tileKey({ x, y, z }) {
  return `${z}/${x}/${y}`
}

// cache: Map<"z/x/y", { width, height, bands: Float32Array[], nodata }>。
// preferZoom+2（256px タイルは表示ズーム+1 で読み込まれる）から 0 まで降順に探し、最初に見つかった
// タイルの値を返す。
export function pickValue(cache, lng, lat, { preferZoom = 0, nodata = null } = {}) {
  if (!cache || cache.size === 0) return null
  const top = Math.max(0, Math.floor(preferZoom) + 2)
  for (let z = top; z >= 0; z--) {
    const t = tileAndPixel(lng, lat, z)
    const tile = cache.get(tileKey(t))
    if (!tile) continue
    const px = Math.min(tile.width - 1, Math.floor((t.px / 256) * tile.width))
    const py = Math.min(tile.height - 1, Math.floor((t.py / 256) * tile.height))
    const idx = py * tile.width + px
    const values = tile.bands.map((b) => b[idx])
    const nd = tile.nodata ?? nodata
    const isNoData = nd != null && values.every((v) => v === nd || Number.isNaN(v))
    return { z, values, isNoData }
  }
  return null
}
