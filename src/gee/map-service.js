// レイヤー用マップ ID（タイル URL）の作成。
//
// 役割: png モードは getMapId（8bit 可視化済みタイル）、raw モードは fileFormat=GEO_TIFF の
//       float 生データタイルを同じ tiles/{z}/{x}/{y} エンドポイントから得る。
// 関係: layer-factory.js が呼ぶ。JS クライアントの ee.data.getMapId は params.format を
//       ee.rpc_convert.fileFormat で ImageFileFormat へ変換する（'GEO_TIFF' はそのまま通る）。
//       vis 無しなら visualizationOptions は null になり、生値がそのまま配信される。
import { getMapIdAsync } from './ee-promise.js'
import { normalizeEeError } from './ee-errors.js'

// raw モードでマスク画素を埋める番兵値。GPU では FilterNoDataVal で discard する。
export const RAW_NODATA = -999999

// png（可視化済み 8bit タイル）。vis は { bands, min, max, palette, gamma, opacity } 等。
export async function createPngMap({ ee, image, vis = {} }) {
  const request = ee.data.images.applyVisualization(image, sanitizeVis(vis))
  try {
    const mapId = await getMapIdAsync(ee, request)
    return {
      kind: 'png',
      mapName: mapId.mapid,
      urlFormat: mapId.urlFormat,
      createdAt: Date.now(),
    }
  } catch (e) {
    throw new Error(normalizeEeError(e), { cause: e })
  }
}

// raw の配信元。maps エンドポイントは fileFormat=GEO_TIFF でも可視化済み 8bit を返すため（実機で確認）、
// raw は image:computePixels（タイルごとに EPSG:3857 の grid を指定）で float を取得する。ここでは式を
// シリアライズして保持するだけで通信しない。
export function createRawSource({ ee, image, bandIds, nodata = RAW_NODATA, project }) {
  if (!Array.isArray(bandIds) || bandIds.length === 0) throw new Error('raw モードには bandIds が必要です。')
  if (bandIds.length > 4) throw new Error('raw モードのバンド数は最大 4 です。')
  if (!project) throw new Error('GEE プロジェクト ID が不明です（ログインし直してください）。')
  const prepared = image.select(bandIds).toFloat().unmask(nodata, false)
  const expression = ee.Serializer.encodeCloudApi(prepared)
  return { kind: 'raw', source: 'computePixels', expression, bandIds, nodata, project, createdAt: Date.now() }
}

// （参考・スパイク用）maps エンドポイントの GEO_TIFF タイル。可視化済み 8bit が返るため本番では使わない。
export async function createRawMap({ ee, image, bandIds, nodata = RAW_NODATA }) {
  if (!Array.isArray(bandIds) || bandIds.length === 0) throw new Error('raw モードには bandIds が必要です。')
  if (bandIds.length > 4) throw new Error('raw モードのバンド数は最大 4 です。')
  const prepared = image.select(bandIds).toFloat().unmask(nodata, false)
  try {
    const mapId = await getMapIdAsync(ee, { image: prepared, format: 'GEO_TIFF', bands: bandIds })
    return {
      kind: 'raw',
      mapName: mapId.mapid,
      urlFormat: mapId.urlFormat,
      bandIds,
      nodata,
      createdAt: Date.now(),
    }
  } catch (e) {
    throw new Error(normalizeEeError(e), { cause: e })
  }
}

// 許可された可視化キーだけを残す（モデルの余計なキーを落とす）。
export function sanitizeVis(vis) {
  const out = {}
  if (!vis || typeof vis !== 'object') return out
  for (const key of ['bands', 'min', 'max', 'palette', 'gamma', 'gain', 'bias', 'opacity']) {
    if (vis[key] != null && vis[key] !== '') out[key] = vis[key]
  }
  // palette は '#rrggbb' でも 'rrggbb' でも受け付けるが、EE は '#' 無しを好むため揃える。
  if (Array.isArray(out.palette)) out.palette = out.palette.map((c) => String(c).replace(/^#/, ''))
  return out
}

// urlFormat の {z}/{x}/{y} を実値で置換する。
export function formatTileUrl(urlFormat, { x, y, z }) {
  return urlFormat.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))
}
