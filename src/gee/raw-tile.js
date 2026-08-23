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
  return { width, height, bands, nodata }
}
