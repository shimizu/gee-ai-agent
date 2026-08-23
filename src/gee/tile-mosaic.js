// 表示中の raw タイル（float GeoTIFF タイル）をクライアントでモザイクし、EPSG:3857 の GeoTIFF に書き出す。
//
// 役割: EE の再計算なしに「画面で見ている値そのまま」を保存する経路。タイル索引の計算・結合・
//       ジオ変換は純関数（テスト対象）、書き出しは geotiff.js の writeArrayBuffer。
// 関係: hooks/useLayerActions の exportLayerTiles から呼ばれる。タイル取得は raw-tile.js を再利用。
import { tileAndPixel } from './pixel-pick.js'
import { MERCATOR_ORIGIN, TOP_RESOLUTION } from './tms.js'
import { fetchRawTile } from './raw-tile.js'
import { formatTileUrl } from './map-service.js'

export const MAX_TILES = 64
const CONCURRENCY = 6

// bounds [w,s,e,n] をズーム z で覆うタイル範囲。
export function tileRangeForBounds(bounds, z) {
  const [w, s, e, n] = bounds.map(Number)
  const tl = tileAndPixel(w, n, z)
  const br = tileAndPixel(e, s, z)
  const xMin = Math.min(tl.x, br.x)
  const xMax = Math.max(tl.x, br.x)
  const yMin = Math.min(tl.y, br.y)
  const yMax = Math.max(tl.y, br.y)
  const cols = xMax - xMin + 1
  const rows = yMax - yMin + 1
  return { xMin, xMax, yMin, yMax, cols, rows, count: cols * rows, z }
}

// 左上タイル原点の EPSG:3857 座標と画素サイズ（m）。
export function mercatorGeoTransform({ xMin, yMin, z, tileSize = 256 }) {
  const tileMeters = (2 * MERCATOR_ORIGIN) / 2 ** z
  const resolution = TOP_RESOLUTION / 2 ** z
  void tileSize
  return {
    originX: -MERCATOR_ORIGIN + xMin * tileMeters,
    originY: MERCATOR_ORIGIN - yMin * tileMeters,
    resolution,
  }
}

// 復号済みタイル [{ index:{x,y}, width, height, bands: Float32Array[] }] を 1 枚に結合する。
export function mosaicTiles(tiles, { xMin, yMin, cols, rows, tileSize = 256, bandCount, nodata = -999999 }) {
  const width = cols * tileSize
  const height = rows * tileSize
  const bands = Array.from({ length: bandCount }, () => new Float32Array(width * height).fill(nodata))
  for (const t of tiles) {
    if (!t?.bands) continue
    const ox = (t.index.x - xMin) * tileSize
    const oy = (t.index.y - yMin) * tileSize
    if (ox < 0 || oy < 0 || ox >= width || oy >= height) continue
    const tw = t.width
    const th = t.height
    for (let b = 0; b < bandCount; b++) {
      const src = t.bands[b]
      if (!src) continue
      const dst = bands[b]
      for (let j = 0; j < Math.min(th, tileSize); j++) {
        const srcRow = j * tw
        const dstRow = (oy + j) * width + ox
        // タイルが 256 以外のサイズでも最近傍で詰める（通常は 256）。
        if (tw === tileSize) dst.set(src.subarray(srcRow, srcRow + tileSize), dstRow)
        else for (let i = 0; i < tileSize; i++) dst[dstRow + i] = src[srcRow + Math.min(tw - 1, Math.floor((i / tileSize) * tw))]
      }
    }
  }
  return { width, height, bands }
}

// バンド別 Float32Array[] を pixel-interleaved の 1 配列に。
export function interleaveBands(bands, width, height) {
  const n = bands.length
  const out = new Float32Array(width * height * n)
  for (let b = 0; b < n; b++) {
    const src = bands[b]
    for (let i = 0, o = b; i < width * height; i++, o += n) out[o] = src[i]
  }
  return out
}

// GeoTIFF（EPSG:3857, Float32, 非圧縮）を ArrayBuffer で返す。
export async function writeGeoTiff3857({ bands, width, height, originX, originY, resolution, nodata = -999999, bandNames = [] }) {
  const { writeArrayBuffer } = await import('geotiff')
  const values = interleaveBands(bands, width, height)
  const n = bands.length
  const metadata = {
    width,
    height,
    BitsPerSample: Array(n).fill(32),
    SampleFormat: Array(n).fill(3),
    SamplesPerPixel: n,
    PlanarConfiguration: 1,
    PhotometricInterpretation: 1,
    ExtraSamples: n > 1 ? Array(n - 1).fill(0) : undefined,
    ModelTiepoint: [0, 0, 0, originX, originY, 0],
    ModelPixelScale: [resolution, resolution, 0],
    GTModelTypeGeoKey: 1,
    GTRasterTypeGeoKey: 1,
    ProjectedCSTypeGeoKey: 3857,
    ProjLinearUnitsGeoKey: 9001,
    GDAL_NODATA: String(nodata),
  }
  if (metadata.ExtraSamples === undefined) delete metadata.ExtraSamples
  if (bandNames.length) metadata.ImageDescription = `bands=${bandNames.join(',')}`
  return writeArrayBuffer(values, metadata)
}

// レイヤーの配信タイルを取得 → モザイク → GeoTIFF Blob。
export async function exportRawLayerTiles({ layer, bounds, z, authHeader = null, onProgress, fetchImpl }) {
  const runtime = layer?.runtime
  const fetchTile =
    typeof runtime?.fetchTile === 'function'
      ? runtime.fetchTile
      : runtime?.urlFormat
        ? (index) => fetchRawTile({ url: formatTileUrl(runtime.urlFormat, index), authHeader, fetchImpl })
        : null
  if (!fetchTile || layer.spec?.mode !== 'raw') throw new Error('raw モードの準備済みレイヤーのみタイルから保存できます。')
  const range = tileRangeForBounds(bounds, z)
  if (range.count > MAX_TILES) {
    throw new Error(`タイル数 ${range.count} が上限 ${MAX_TILES} を超えます。ズームを下げるか範囲を狭めてください。`)
  }
  const bandIds = runtime.bandIds ?? []
  const bandCount = Math.max(1, bandIds.length)
  const indices = []
  for (let y = range.yMin; y <= range.yMax; y++) for (let x = range.xMin; x <= range.xMax; x++) indices.push({ x, y, z })

  const tiles = []
  let done = 0
  let cursor = 0
  async function worker() {
    while (cursor < indices.length) {
      const index = indices[cursor++]
      try {
        const decoded = await fetchTile(index, {})
        if (decoded) tiles.push({ index, ...decoded })
      } catch (e) {
        // 1 タイルの失敗は nodata 埋めにして続行（ログだけ残す）。
        onProgress?.({ done, total: indices.length, error: String(e?.message ?? e) })
      }
      done++
      onProgress?.({ done, total: indices.length })
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, indices.length) }, worker))
  if (!tiles.length) throw new Error('取得できたタイルがありません（範囲外またはネットワークエラー）。')

  const nodata = layer.spec?.nodata ?? -999999
  const { width, height, bands } = mosaicTiles(tiles, { ...range, bandCount, nodata })
  const gt = mercatorGeoTransform({ xMin: range.xMin, yMin: range.yMin, z })
  const buffer = await writeGeoTiff3857({ bands, width, height, ...gt, nodata, bandNames: bandIds })
  return {
    blob: new Blob([buffer], { type: 'image/tiff' }),
    width,
    height,
    tileCount: tiles.length,
    bands: bandIds,
    bytes: buffer.byteLength,
  }
}
