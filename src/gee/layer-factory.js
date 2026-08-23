// レイヤー spec → 描画ランタイム（png: タイル URL / raw: getTileData）を組み立てる。
//
// 役割: spec.code を実行して ee.Image を得て、png/raw のマップ ID を作る。raw は参照安定な
//       getTileData をここで 1 回だけ作る（変わると TileLayer が全タイルを再取得するため）。
//       リロード後の復元・mapid 失効時の再作成にも同じ関数を使う。
// 関係: hooks/useLayerActions.js から呼ばれる。ee の実行は code-runner.js、マップ作成は
//       map-service.js、タイル復号は raw-tile.js、テクスチャは raster-texture.js。
import { runEeCode, isEeObject, eeTypeName } from './code-runner.js'
import { evaluate } from './ee-promise.js'
import { normalizeEeError } from './ee-errors.js'
import { createPngMap, createRawMap, formatTileUrl, RAW_NODATA } from './map-service.js'
import { fetchRawTile } from './raw-tile.js'
import { createRasterTexture, packBands } from './raster-texture.js'

// code を実行して ee.Image に正規化する。ImageCollection は mosaic()、それ以外はエラー。
export async function materializeImage({ ee, code, ctx }) {
  const value = await runEeCode({ ee, code, ctx })
  if (!isEeObject(ee, value)) {
    throw new Error(
      `code の戻り値が Earth Engine オブジェクトではありません（${typeof value}）。ee.Image を return してください。`,
    )
  }
  if (value instanceof ee.Image) return value
  if (value instanceof ee.ImageCollection) return value.mosaic()
  const type = eeTypeName(ee, value)
  throw new Error(`code の戻り値は ee.Image か ee.ImageCollection にしてください（実際: ${type}）。`)
}

// spec: { code, mode, vis, colormap, colormapReversed, rescale, bandMath, nodata }
export async function buildRasterRuntime({ ee, spec, layerId, ctx, geeClient, tileCache }) {
  const image = await materializeImage({ ee, code: spec.code, ctx })
  let bandNames
  try {
    bandNames = await evaluate(image.bandNames(), { timeoutMs: 120_000 })
  } catch (e) {
    throw new Error(normalizeEeError(e), { cause: e })
  }
  if (!bandNames.length) throw new Error('画像にバンドがありません。フィルタ条件やバンド選択を見直してください。')

  if (spec.mode === 'png') {
    const vis = { ...(spec.vis ?? {}) }
    if (vis.bands == null && bandNames.length >= 3) vis.bands = bandNames.slice(0, 3)
    const map = await createPngMap({ ee, image, vis })
    return { ...map, status: 'ready', bandNames }
  }

  // raw
  const bandIds = resolveBandIds(spec, bandNames)
  const nodata = spec.nodata ?? RAW_NODATA
  const map = await createRawMap({ ee, image, bandIds, nodata })

  const getTileData = async (tile, { device, signal }) => {
    const url = formatTileUrl(map.urlFormat, tile.index)
    const decoded = await fetchRawTile({ url, authHeader: geeClient?.authHeader?.() ?? null, signal })
    if (!decoded) return null
    const packed = packBands(decoded.bands, decoded.width, decoded.height)
    const texture = createRasterTexture(device, packed, decoded.width, decoded.height)
    tileCache?.set(layerId, tile.index, decoded)
    return {
      width: decoded.width,
      height: decoded.height,
      texture,
      channels: packed.channels,
      byteLength: packed.data.byteLength,
      index: tile.index,
    }
  }

  return { ...map, status: 'ready', bandNames, bandIds, getTileData }
}

// raw で配信するバンド: spec.vis.bands → spec.bands → 先頭 1 バンド（band math 指定時は 2 バンド）。
export function resolveBandIds(spec, bandNames) {
  const requested = spec.bands ?? spec.vis?.bands
  let ids = Array.isArray(requested) ? requested : typeof requested === 'string' ? requested.split(',') : null
  if (!ids || ids.length === 0) ids = spec.bandMath ? bandNames.slice(0, 2) : bandNames.slice(0, 1)
  ids = ids.map((s) => String(s).trim()).filter(Boolean)
  const missing = ids.filter((b) => !bandNames.includes(b))
  if (missing.length) {
    throw new Error(`指定バンドが画像にありません: ${missing.join(', ')}（実在: ${bandNames.join(', ')}）`)
  }
  if (ids.length > 4) throw new Error('raw モードで配信できるバンドは最大 4 です。')
  return ids
}
