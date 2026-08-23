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
import { createPngMap, createRawSource, RAW_NODATA } from './map-service.js'
import { fetchComputePixelsTile } from './raw-tile.js'
import { tileAffineTransform } from './tms.js'
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

// 表示範囲の統計に使う scale（m）。表示幅を ~512 画素に割る（粗くして速く）。
export function statScaleForBounds(bounds) {
  if (!Array.isArray(bounds) || bounds.length !== 4) return 1000
  const [w, s, e, n] = bounds.map(Number)
  const midLat = (s + n) / 2
  const widthM = (e - w) * 111320 * Math.max(0.05, Math.cos((midLat * Math.PI) / 180))
  return Math.max(30, Math.round(widthM / 512))
}

// 表示範囲での実データ統計（min/max/count/2–98 パーセンタイル）。失敗時は null（ベストエフォート）。
export async function computeViewStats({ ee, image, bands, bounds, timeoutMs = 90_000 }) {
  if (!bounds || !bands?.length) return null
  const band = bands[0]
  const geometry = ee.Geometry.Rectangle(bounds, null, false)
  const reducer = ee.Reducer.minMax().combine(ee.Reducer.count(), '', true).combine(ee.Reducer.percentile([2, 98]), '', true)
  const dict = image.select([band]).reduceRegion({ reducer, geometry, scale: statScaleForBounds(bounds), bestEffort: true, maxPixels: 1e8 })
  const r = await evaluate(dict, { timeoutMs })
  const get = (k) => (r?.[`${band}_${k}`] ?? null)
  return { band, min: get('min'), max: get('max'), count: get('count') ?? 0, p2: get('p2'), p98: get('p98') }
}

function summarizeStats(stats) {
  if (!stats) return undefined
  const r = (v) => (v == null ? null : Math.round(v * 10000) / 10000)
  return { band: stats.band, min: r(stats.min), max: r(stats.max), p2: r(stats.p2), p98: r(stats.p98), count: stats.count }
}

// spec: { code, mode, vis, colormap, colormapReversed, rescale, bandMath, nodata }
// options.checkStats: 表示範囲の統計を取り、有効画素が無ければエラーにする（新規追加時）。復元/再作成では false。
export async function buildRasterRuntime({ ee, spec, layerId, ctx, geeClient, tileCache, checkStats = true, log }) {
  const image = await materializeImage({ ee, code: spec.code, ctx })
  let bandNames
  try {
    bandNames = await evaluate(image.bandNames(), { timeoutMs: 120_000 })
  } catch (e) {
    throw new Error(normalizeEeError(e), { cause: e })
  }
  if (!bandNames.length) throw new Error('画像にバンドがありません。フィルタ条件やバンド選択を見直してください。')

  // 表示範囲の統計（空レイヤーの検出と、raw の自動レンジ）。
  let stats = null
  if (checkStats) {
    let bounds
    try {
      bounds = ctx?.mapView?.()?.bounds ?? null
    } catch {
      bounds = null
    }
    const statBands = spec.mode === 'raw' ? resolveBandIds(spec, bandNames) : resolveVisBands(spec, bandNames)
    try {
      stats = await computeViewStats({ ee, image, bands: statBands, bounds })
    } catch (e) {
      log?.(`統計チェックをスキップ: ${String(e?.message ?? e).split('\n')[0]}`)
      stats = null
    }
    if (stats && stats.count === 0) {
      throw new Error(
        `表示範囲に有効な画素がありません（バンド ${stats.band}）。フィルタ結果が空（例: 境界の名前が一致せず clip 対象が空）、期間に画像が無い、または対象が表示範囲外の可能性があります。` +
          'ee_describe で size() や実在する名前を確認し、fit_bounds で対象範囲へ移動してから再試行してください。',
      )
    }
  }

  if (spec.mode === 'png') {
    const vis = { ...(spec.vis ?? {}) }
    if (vis.bands == null && bandNames.length >= 3) vis.bands = bandNames.slice(0, 3)
    const map = await createPngMap({ ee, image, vis })
    return { ...map, status: 'ready', bandNames, dataRange: summarizeStats(stats) }
  }

  // raw
  const bandIds = resolveBandIds(spec, bandNames)
  const nodata = spec.nodata ?? RAW_NODATA
  // rescale 未指定（または 'auto'）なら 2–98 パーセンタイルで自動設定する。
  let autoRescale = null
  const wantsAuto = spec.rescale == null || spec.rescale === 'auto'
  if (wantsAuto && stats && stats.p2 != null && stats.p98 != null && stats.p98 > stats.p2) {
    autoRescale = [stats.p2, stats.p98]
  } else if (wantsAuto && stats && stats.min != null && stats.max != null && stats.max > stats.min) {
    autoRescale = [stats.min, stats.max]
  }
  const map = createRawSource({ ee, image, bandIds, nodata, project: geeClient?.project })

  // タイル 1 枚を float で取得する関数（地図描画とタイルエクスポートで共用）。
  const fetchTile = (index, { signal } = {}) =>
    fetchComputePixelsTile({
      project: map.project,
      expression: map.expression,
      bandIds,
      affine: tileAffineTransform(index),
      authHeader: geeClient?.authHeader?.() ?? null,
      signal,
    })

  let diagnosed = false
  const getTileData = async (tile, { device, signal }) => {
    const decoded = await fetchTile(tile.index, { signal })
    if (!decoded) return null
    // 最初の 1 枚だけ中身を診断ログに残す（バンド数・型・値域）。表示の不具合切り分け用。
    if (!diagnosed && log) {
      diagnosed = true
      try {
        log(`raw タイル診断 ${layerId} z${tile.index.z}: ${decoded.width}×${decoded.height}, bands=${decoded.bands.length}, type=${decoded.rawType} sf=${decoded.sampleFormat} bits=${decoded.bitsPerSample}, nodataTag=${decoded.nodata}, ${describeBand(decoded.bands[0], nodata)}`)
      } catch {
        // 無視
      }
    }
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

  return { ...map, status: 'ready', bandNames, bandIds, getTileData, fetchTile, dataRange: summarizeStats(stats), autoRescale }
}

// 診断ログ用: バンドの有効画素数・min/max・異なる値の数（上限 16 まで数える）。
export function describeBand(arr, nodata) {
  if (!arr) return 'band=none'
  let min = Infinity
  let max = -Infinity
  let valid = 0
  const seen = new Set()
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i]
    if (v === nodata || Number.isNaN(v)) continue
    valid++
    if (v < min) min = v
    if (v > max) max = v
    if (seen.size < 16) seen.add(Math.round(v * 1000) / 1000)
  }
  if (!valid) return 'valid=0'
  return `valid=${valid}/${arr.length} min=${Math.round(min * 1000) / 1000} max=${Math.round(max * 1000) / 1000} distinct≥${seen.size}`
}

// png の統計対象バンド: vis.bands の先頭 → 先頭バンド。
export function resolveVisBands(spec, bandNames) {
  const b = spec.vis?.bands
  const ids = Array.isArray(b) ? b : typeof b === 'string' ? b.split(',') : []
  const first = ids.map((s) => String(s).trim()).find((s) => bandNames.includes(s))
  return [first ?? bandNames[0]]
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
