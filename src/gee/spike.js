// 開発専用: raw タイル（fileFormat=GEO_TIFF）配信の動作確認スパイク。
//
// 役割: GEE ログイン後に DevTools から `window.__geeSpike()` を呼び、SRTM の 1 バンドを raw で
//       getMapId → タイル取得 → GeoTIFF 復号 → 統計値をコンソールに出す。結果は
//       docs/spike-raw-tiles.md に記録する。本番バンドルには含めない（main.jsx で DEV 時のみ import）。
import { loadEe } from './ee-loader.js'
import { createRawMap, createPngMap, createRawSource, formatTileUrl } from './map-service.js'
import { fetchRawTile, fetchComputePixelsTile } from './raw-tile.js'
import { tileAffineTransform } from './tms.js'

export async function runRawTileSpike({ z = 8, x = 227, y = 100 } = {}) {
  const ee = await loadEe()
  if (!ee.data.getAuthToken()) throw new Error('先にヘッダーの GEE ログインを済ませてください。')
  const image = ee.Image('USGS/SRTMGL1_003').select('elevation')

  console.group('[spike] raw map (GEO_TIFF)')
  const raw = await createRawMap({ ee, image, bandIds: ['elevation'] })
  console.log('urlFormat:', raw.urlFormat)
  const url = formatTileUrl(raw.urlFormat, { x, y, z })
  const res = await fetch(url)
  console.log('HTTP', res.status, 'content-type:', res.headers.get('content-type'), 'bytes:', res.headers.get('content-length'))
  const decoded = await fetchRawTile({ url, authHeader: ee.data.getAuthToken() })
  if (decoded) {
    const b = decoded.bands[0]
    let min = Infinity
    let max = -Infinity
    let nd = 0
    for (const v of b) {
      if (v === raw.nodata) nd++
      else {
        if (v < min) min = v
        if (v > max) max = v
      }
    }
    console.log('decoded', { width: decoded.width, height: decoded.height, bands: decoded.bands.length, nodataTag: decoded.nodata, min, max, nodataPixels: nd })
  } else {
    console.log('decoded: null（データ無しタイル）')
  }
  console.groupEnd()

  console.group('[spike] computePixels tile (本番経路)')
  const src = createRawSource({ ee, image, bandIds: ['elevation'], project: window.__geeDev?.geeClient?.project ?? ee.data.getProject?.() })
  const cp = await fetchComputePixelsTile({ project: src.project, expression: src.expression, bandIds: ['elevation'], affine: tileAffineTransform({ x, y, z }), authHeader: ee.data.getAuthToken() })
  console.log('computePixels decoded', cp && { width: cp.width, height: cp.height, bands: cp.bands.length, type: cp.rawType, sf: cp.sampleFormat, bits: cp.bitsPerSample, nodataTag: cp.nodata, sample: Array.from(cp.bands[0].slice(0, 5)) })
  console.groupEnd()

  console.group('[spike] png map')
  const png = await createPngMap({ ee, image, vis: { min: 0, max: 3000, palette: ['000000', 'ffffff'] } })
  const pres = await fetch(formatTileUrl(png.urlFormat, { x, y, z }))
  console.log('HTTP', pres.status, 'content-type:', pres.headers.get('content-type'), 'CORS ok:', pres.type !== 'opaque')
  console.groupEnd()
  return { raw, decoded: decoded && { width: decoded.width, height: decoded.height, nodata: decoded.nodata } }
}

export function installSpike() {
  if (typeof window !== 'undefined') window.__geeSpike = runRawTileSpike
}

// 開発専用: GEE 無しで raw パイプラインを確認する合成レイヤー（経度で値が変わるグラデーション）。
// window.__geeDev.addSyntheticRawLayer() で追加。deck.gl-raster の描画・カラーマップ・ホバーの検証用。
export function makeSyntheticRawLayer({ layerId = 'lyr_demo', name = '合成 raw デモ', tileCache = null } = {}) {
  const synth = ({ x, y, z }) => {
    const n = 2 ** z
    const size = 256
    const data = new Float32Array(size * size)
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const lng = ((x + i / size) / n) * 360 - 180
        const latT = (y + j / size) / n
        data[j * size + i] = Math.sin((lng * Math.PI) / 45) * 50 + latT * 100
      }
    }
    return { width: size, height: size, bands: [data], nodata: null }
  }
  const fetchTile = async (index) => synth(index)
  const getTileData = async (tile, { device }) => {
    const size = 256
    const { bands } = synth(tile.index)
    const data = bands[0]
    const { createRasterTexture, packBands } = await import('./raster-texture.js')
    const packed = packBands([data], size, size)
    const texture = createRasterTexture(device, packed, size, size)
    tileCache?.set(layerId, tile.index, { width: size, height: size, bands: [data], nodata: null })
    return { width: size, height: size, texture, channels: 1, byteLength: data.byteLength, index: tile.index }
  }
  return {
    layerId,
    kind: 'ee-raster',
    name,
    visible: true,
    opacity: 0.85,
    spec: { code: '// synthetic', mode: 'raw', vis: {}, bands: ['v'], colormap: 'viridis', colormapReversed: false, rescale: [-50, 150], bandMath: null, nodata: -999999 },
    bandNames: ['v'],
    originPrompt: 'dev',
    createdAt: new Date().toISOString(),
    runtime: { status: 'ready', kind: 'raw', bandIds: ['v'], getTileData, fetchTile },
  }
}
