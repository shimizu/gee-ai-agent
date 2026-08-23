// EE 経由のラスターエクスポート（getDownloadURL / getThumbURL）。
//
// 役割: レイヤー spec から ee.Image を再構築し、指定範囲・解像度・CRS の GeoTIFF（元のデータ型のまま）または
//       可視化 PNG のダウンロード URL を作る。サイズ上限（EE は 1 リクエスト ≒48MB）を事前に推定して抑止する。
// 関係: hooks/useLayerActions（UI）と tools/map（export_layer ツール）が使う。純関数部分はテスト対象。
import { withTimeout } from './ee-promise.js'
import { normalizeEeError } from './ee-errors.js'
import { materializeImage } from './layer-factory.js'
import { sanitizeVis } from './map-service.js'

export const DOWNLOAD_LIMIT_BYTES = 48 * 1024 * 1024
export const SUPPORTED_CRS = ['EPSG:4326', 'EPSG:3857']
const EARTH_R = 6378137
const DEG_M = (Math.PI * EARTH_R) / 180 // 1 度 ≒ 111319.49 m

// [w,s,e,n] → GeoJSON Polygon。
export function boundsToPolygon(bounds) {
  const [w, s, e, n] = bounds.map(Number)
  return {
    type: 'Polygon',
    coordinates: [
      [
        [w, s],
        [e, s],
        [e, n],
        [w, n],
        [w, s],
      ],
    ],
  }
}

export function normalizeCrs(crs) {
  if (crs == null || crs === '') return 'EPSG:4326'
  const s = String(crs).toUpperCase().trim()
  const m = /^(?:EPSG:)?(\d+)$/.exec(s)
  const code = m ? `EPSG:${m[1]}` : s
  if (!SUPPORTED_CRS.includes(code)) throw new Error(`crs は ${SUPPORTED_CRS.join(' / ')} のいずれかです: ${crs}`)
  return code
}

export function validateBounds(bounds) {
  if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every((v) => Number.isFinite(Number(v)))) {
    throw new Error('bounds は [west, south, east, north] の数値 4 要素です。')
  }
  const [w, s, e, n] = bounds.map(Number)
  if (e <= w || n <= s) throw new Error('bounds の east > west, north > south である必要があります。')
  return [w, s, e, n]
}

// getDownloadURL の params を組み立てる（純関数）。
export function buildDownloadParams({ name = 'export', bands, bounds, scale, crs, format = 'GEO_TIFF' } = {}) {
  const b = validateBounds(bounds)
  const sc = Number(scale)
  if (!Number.isFinite(sc) || sc <= 0) throw new Error('scale（m）は正の数で指定してください。')
  const params = {
    name: String(name).replace(/[^\w-]+/g, '_').slice(0, 60) || 'export',
    region: boundsToPolygon(b),
    scale: sc,
    crs: normalizeCrs(crs),
    format: String(format).toUpperCase() === 'NPY' ? 'NPY' : 'GEO_TIFF',
    filePerBand: false,
  }
  if (Array.isArray(bands) && bands.length) params.bands = bands.map(String)
  return params
}

// bounds を対象 CRS のメートル寸法に換算する。
export function boundsSizeMeters(bounds, crs = 'EPSG:4326') {
  const [w, s, e, n] = validateBounds(bounds)
  const midLat = (s + n) / 2
  if (normalizeCrs(crs) === 'EPSG:3857') {
    // Web Mercator はメートルだが緯度で伸長する（1/cos φ）。
    const k = 1 / Math.max(0.05, Math.cos((midLat * Math.PI) / 180))
    return { widthM: (e - w) * DEG_M * k, heightM: (n - s) * DEG_M * k }
  }
  // EPSG:4326 を scale（m）で要求すると EE は赤道換算で度→m する（画素は緯度方向に非正方になる）。
  return { widthM: (e - w) * DEG_M, heightM: (n - s) * DEG_M }
}

// 推定サイズ（純関数）。超過時は上限に収まる scale を提案する。
export function estimateDownloadBytes({ bounds, scale, crs = 'EPSG:4326', bandCount = 1, bytesPerSample = 4 }) {
  const { widthM, heightM } = boundsSizeMeters(bounds, crs)
  const sc = Number(scale)
  if (!Number.isFinite(sc) || sc <= 0) throw new Error('scale（m）は正の数で指定してください。')
  const width = Math.ceil(widthM / sc)
  const height = Math.ceil(heightM / sc)
  const pixels = width * height
  const bytes = pixels * Math.max(1, bandCount) * bytesPerSample
  const overLimit = bytes > DOWNLOAD_LIMIT_BYTES
  let suggestedScale = null
  if (overLimit) {
    // bytes ∝ 1/scale² なので、上限に収まる scale = scale × sqrt(bytes/limit)（余裕 10%）。
    suggestedScale = Math.ceil(sc * Math.sqrt(bytes / DOWNLOAD_LIMIT_BYTES) * 1.1)
  }
  return { width, height, pixels, bytes, mb: bytes / 1024 / 1024, overLimit, suggestedScale, limitBytes: DOWNLOAD_LIMIT_BYTES }
}

export function getDownloadUrlAsync(ee, image, params, { timeoutMs = 180_000 } = {}) {
  return withTimeout(
    new Promise((resolve, reject) => {
      try {
        image.getDownloadURL(params, (url, error) => {
          if (error || !url) reject(new Error(String(error ?? 'ダウンロード URL を取得できませんでした')))
          else resolve(url)
        })
      } catch (e) {
        reject(e)
      }
    }),
    timeoutMs,
    'ダウンロード URL の作成がタイムアウトしました。範囲を狭めるか scale を粗くしてください。',
  )
}

export function getThumbUrlAsync(ee, image, params, { timeoutMs = 180_000 } = {}) {
  return withTimeout(
    new Promise((resolve, reject) => {
      try {
        image.getThumbURL(params, (url, error) => {
          if (error || !url) reject(new Error(String(error ?? 'サムネイル URL を取得できませんでした')))
          else resolve(url)
        })
      } catch (e) {
        reject(e)
      }
    }),
    timeoutMs,
    'PNG の作成がタイムアウトしました。範囲を狭めるか scale を粗くしてください。',
  )
}

// レイヤー → ダウンロード URL。format: 'geotiff' | 'png'（png はレイヤーの vis で可視化）。
export async function exportLayerFromEE({ ee, layer, bounds, scale, crs, bands, format = 'geotiff', ctx, log }) {
  if (!layer || layer.kind !== 'ee-raster') throw new Error('EE ラスターレイヤーのみエクスポートできます。')
  const fmt = String(format).toLowerCase() === 'png' ? 'png' : 'geotiff'
  const bandList = Array.isArray(bands) && bands.length ? bands : null
  const bandCount = bandList?.length ?? layer.bandNames?.length ?? 1
  const estimate = estimateDownloadBytes({ bounds, scale, crs, bandCount, bytesPerSample: fmt === 'png' ? 1 : 4 })
  if (fmt === 'geotiff' && estimate.overLimit) {
    throw new Error(
      `推定サイズ ${estimate.mb.toFixed(1)}MB が上限 ${Math.round(DOWNLOAD_LIMIT_BYTES / 1024 / 1024)}MB を超えます。scale を ${estimate.suggestedScale}m 以上にするか範囲を狭めてください。`,
    )
  }
  let image = await materializeImage({ ee, code: layer.spec.code, ctx })
  if (bandList) image = image.select(bandList)
  const name = `${layer.name || layer.layerId}`.replace(/[^\w-]+/g, '_').slice(0, 60) || 'layer'
  try {
    if (fmt === 'png') {
      const vis = sanitizeVis(layer.spec?.vis ?? {})
      const params = { ...vis, region: boundsToPolygon(validateBounds(bounds)), scale: Number(scale), crs: normalizeCrs(crs), format: 'png' }
      const url = await getThumbUrlAsync(ee, image, params)
      log?.(`PNG エクスポート URL 作成: ${layer.name}`)
      return { url, filename: `${name}.png`, format: 'png', estimate }
    }
    const params = buildDownloadParams({ name, bands: bandList, bounds, scale, crs, format: 'GEO_TIFF' })
    const url = await getDownloadUrlAsync(ee, image, params)
    log?.(`GeoTIFF エクスポート URL 作成: ${layer.name}（scale ${scale}m, ${params.crs}）`)
    return { url, filename: `${name}.tif`, format: 'geotiff', estimate, params: { scale: params.scale, crs: params.crs, bands: params.bands ?? null } }
  } catch (e) {
    throw new Error(normalizeEeError(e), { cause: e })
  }
}
