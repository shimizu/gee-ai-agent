// raw モードのタイル取得と GeoTIFF 復号。
//
// 役割: EE の float GeoTIFF タイルを fetch し、geotiff.js でバンド別 Float32Array に復号する。
//       復号結果は GPU テクスチャ化（raster-texture.js）とホバー時の実値参照（tile-cache.js）
//       の両方に使う。
// 関係: layer-factory.js の getTileData から呼ばれる。fetchImpl 注入でテスト可能。
let geotiffModule = null
function loadGeotiff() {
  geotiffModule ??= import('geotiff')
  return geotiffModule
}

const EE_BASE = 'https://earthengine.googleapis.com/v1'

// image:computePixels のリクエスト本文（純関数）。grid は EPSG:3857 のタイル 1 枚分。
export function buildComputePixelsBody({ expression, bandIds, affine, tileSize = 256, fileFormat = 'GEO_TIFF' }) {
  return {
    expression,
    fileFormat,
    bandIds,
    grid: {
      dimensions: { width: tileSize, height: tileSize },
      affineTransform: affine,
      crsCode: 'EPSG:3857',
    },
  }
}

// computePixels で 1 タイル分の float GeoTIFF を取得して復号する。
// 認証必須（Authorization: Bearer）。429/503 は少し待って 1 回だけ再試行。
export async function fetchComputePixelsTile({ project, expression, bandIds, affine, authHeader, signal, fetchImpl = globalThis.fetch, tileSize = 256 }) {
  if (!authHeader) throw new Error('GEE の認証トークンがありません（再ログインしてください）。')
  const url = `${EE_BASE}/projects/${encodeURIComponent(project)}/image:computePixels`
  const body = JSON.stringify(buildComputePixelsBody({ expression, bandIds, affine, tileSize }))
  const doFetch = () => fetchImpl(url, { method: 'POST', headers: { authorization: authHeader, 'content-type': 'application/json' }, body, signal })
  let res = await doFetch()
  if (res.status === 429 || res.status === 503) {
    await new Promise((r) => setTimeout(r, 800 + Math.random() * 700))
    res = await doFetch()
  }
  if (!res.ok) {
    let message = `EE computePixels HTTP ${res.status}`
    try {
      const j = await res.json()
      if (j?.error?.message) message += `: ${j.error.message}`
    } catch {
      // 本文なし
    }
    const err = new Error(message)
    err.status = res.status
    throw err
  }
  const buf = await res.arrayBuffer()
  if (buf.byteLength === 0) return null
  return decodeGeoTiffTile(buf)
}

// タイルを取得して復号する。データ無しタイル（404/204）は null。
export async function fetchRawTile({ url, authHeader = null, signal, fetchImpl = globalThis.fetch }) {
  let res = await fetchImpl(url, { signal })
  // 公開タイルのはずだが、認証を要求された場合だけ Authorization を付けて再試行する。
  if ((res.status === 401 || res.status === 403) && authHeader) {
    res = await fetchImpl(url, { signal, headers: { authorization: authHeader } })
  }
  if (res.status === 404 || res.status === 204) return null
  if (!res.ok) {
    const err = new Error(`EE タイル取得失敗 HTTP ${res.status}`)
    err.status = res.status
    throw err
  }
  const buf = await res.arrayBuffer()
  if (buf.byteLength === 0) return null
  return decodeGeoTiffTile(buf)
}

// GeoTIFF バイト列 → { width, height, bands: Float32Array[], nodata }。
export async function decodeGeoTiffTile(buf) {
  const { fromArrayBuffer } = await loadGeotiff()
  const tiff = await fromArrayBuffer(buf)
  const image = await tiff.getImage()
  const rasters = await image.readRasters()
  const width = image.getWidth()
  const height = image.getHeight()
  let nodata
  try {
    nodata = image.getGDALNoData()
  } catch {
    nodata = null
  }
  const bands = Array.from(rasters, (b) => (b instanceof Float32Array ? b : Float32Array.from(b)))
  // 診断用: 元のサンプル型（3=float, 1=uint, 2=int）とビット深度。
  let sampleFormat = null
  let bitsPerSample = null
  try {
    sampleFormat = image.getSampleFormat()
    bitsPerSample = image.getBitsPerSample()
  } catch {
    // 無視
  }
  return { width, height, bands, nodata, sampleFormat, bitsPerSample, rawType: rasters[0]?.constructor?.name ?? null }
}
