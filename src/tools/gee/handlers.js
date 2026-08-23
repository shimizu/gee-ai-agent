// GEE ツールの実装。
//
// 役割: definitions.js の各ツールを gee/* モジュールで実装する。LLM へは要約だけ返す。
// 関係: index.js が registry.register(definition, handler) する。deps は register-tools.js 参照。
import { runEeCode, resolveResult, isEeObject, eeTypeName } from '../../gee/code-runner.js'
import { evaluate } from '../../gee/ee-promise.js'
import { normalizeEeError } from '../../gee/ee-errors.js'
import { BAND_MATH_NAMES, COLORMAP_NAMES, DEFAULT_COLORMAP } from '../../gee/pipeline.js'
import { RAW_NODATA } from '../../gee/map-service.js'
import { regionToEeGeometry, normalizeRegion } from '../shared/region.js'
import {
  capValue,
  featureCollectionToRows,
  isRowArray,
  summarizeDataset,
} from '../shared/summarize.js'

const DATASET_AUTO_THRESHOLD = 20

// ツールから見た EE 実行コンテキスト（ctx）を作る。
export function makeEeContext(ee, deps) {
  return {
    mapBounds: () => {
      const view = deps.getMapView?.()
      if (!view?.bounds) throw new Error('地図表示範囲を取得できません。')
      return ee.Geometry.Rectangle(view.bounds, null, false)
    },
    geometry: deps.getAoiGeometry?.(ee) ?? null,
    log: (msg) => deps.log?.(`[ee] ${String(msg)}`),
    now: new Date().toISOString(),
  }
}

export function makeGeeHandlers(deps) {
  const { geeClient, datasetStore, log } = deps

  async function eeRun(input) {
    const ee = geeClient.assertReady()
    const ctx = makeEeContext(ee, deps)
    const value = await runEeCode({ ee, code: input.code, ctx })
    const typeName = isEeObject(ee, value) ? eeTypeName(ee, value) : typeof value
    const resolved = await resolveResult(ee, value)

    // 行データは Dataset Store へ。
    let rows = null
    let geojson = null
    if (resolved?.type === 'FeatureCollection' && Array.isArray(resolved.features)) {
      rows = featureCollectionToRows(resolved)
      geojson = resolved
    } else if (isRowArray(resolved)) {
      rows = resolved
    }
    const shouldStore = rows && (input.save_as_dataset || rows.length > DATASET_AUTO_THRESHOLD)
    if (shouldStore) {
      const ds = datasetStore.add({
        title: input.title || `ee_run 結果（${typeName}）`,
        source: 'gee',
        records: rows,
        meta: geojson ? { hasGeojson: true, featureCount: geojson.features.length } : null,
      })
      if (geojson) deps.attachGeojson?.(ds.id, geojson)
      log?.(`データセット保存: ${ds.id}（${rows.length} 行）`)
      return { type: typeName, stored: true, ...summarizeDataset(ds) }
    }
    return { type: typeName, value: capValue(resolved) }
  }

  async function eeAddLayer(input) {
    geeClient.assertReady()
    const mode = input.mode === 'raw' ? 'raw' : 'png'
    if (input.colormap && !COLORMAP_NAMES.includes(String(input.colormap).toLowerCase())) {
      throw new Error(`未知の colormap: ${input.colormap}。利用可能: ${COLORMAP_NAMES.slice(0, 40).join(', ')} …`)
    }
    if (input.band_math && !BAND_MATH_NAMES.includes(input.band_math)) {
      throw new Error(`未知の band_math: ${input.band_math}（${BAND_MATH_NAMES.join(' / ')}）`)
    }
    const spec = {
      code: input.code,
      mode,
      vis: input.vis ?? {},
      bands: input.bands ?? input.vis?.bands ?? null,
      colormap: String(input.colormap ?? DEFAULT_COLORMAP).toLowerCase(),
      colormapReversed: Boolean(input.colormap_reversed),
      rescale: Array.isArray(input.rescale) && input.rescale.length === 2 ? input.rescale.map(Number) : null,
      bandMath: input.band_math ?? null,
      nodata: RAW_NODATA,
    }
    if (mode === 'raw' && !spec.rescale) {
      // rescale 未指定なら vis.min/max を流用、無ければ [0,1]。
      const mn = Array.isArray(input.vis?.min) ? input.vis.min[0] : input.vis?.min
      const mx = Array.isArray(input.vis?.max) ? input.vis.max[0] : input.vis?.max
      spec.rescale = Number.isFinite(Number(mn)) && Number.isFinite(Number(mx)) ? [Number(mn), Number(mx)] : [0, 1]
    }
    const layer = await deps.addRasterLayer({
      name: input.name,
      spec,
      opacity: input.opacity,
      originPrompt: deps.session?.originPrompt ?? '',
    })
    if (input.fit_bounds != null) {
      try {
        await fitToRegion(input.fit_bounds)
      } catch (e) {
        log?.(`fit_bounds 失敗: ${String(e?.message ?? e)}`)
      }
    }
    return {
      layerId: layer.layerId,
      name: layer.name,
      mode,
      bandNames: layer.bandNames,
      bandIds: layer.runtime?.bandIds ?? undefined,
      rescale: mode === 'raw' ? spec.rescale : undefined,
      colormap: mode === 'raw' ? spec.colormap : undefined,
      hint:
        mode === 'raw'
          ? 'update_layer_style で colormap / rescale を再計算なしに変更できます。地図上でホバーすると実値が表示されます。'
          : 'vis を変えるには ee_add_layer を同じ name で呼び直してください（置き換わります）。',
    }
  }

  async function fitToRegion(region) {
    const r = normalizeRegion(region)
    if (!r) return
    if (r.type === 'bbox') {
      deps.fitBounds?.(r.bounds)
      return
    }
    const ee = geeClient.assertReady()
    const geom = regionToEeGeometry(ee, r, deps)
    const b = await evaluate(geom.bounds(), { timeoutMs: 60_000 })
    const coords = b?.coordinates?.[0]
    if (!coords) return
    const xs = coords.map((c) => c[0])
    const ys = coords.map((c) => c[1])
    deps.fitBounds?.([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)])
  }

  async function eeTimeSeries(input) {
    const ee = geeClient.assertReady()
    const ctx = makeEeContext(ee, deps)
    const value = await runEeCode({ ee, code: input.collection_code, ctx })
    if (!(value instanceof ee.ImageCollection)) {
      throw new Error(`collection_code は ee.ImageCollection を return してください（実際: ${eeTypeName(ee, value)}）。`)
    }
    const geometry = regionToEeGeometry(ee, input.region, deps)
    if (!geometry) throw new Error('region を指定してください。')
    const reducerName = input.reducer ?? 'mean'
    if (typeof ee.Reducer?.[reducerName] !== 'function') throw new Error(`未知の reducer: ${reducerName}`)
    const reducer = ee.Reducer[reducerName]()
    const scale = Number(input.scale) > 0 ? Number(input.scale) : 500
    const maxImages = Math.min(Math.max(Number(input.max_images) || 500, 1), 2000)
    const dateFormat = input.date_format || 'YYYY-MM-dd'

    let ic = value
    if (Array.isArray(input.bands) && input.bands.length) ic = ic.select(input.bands)
    ic = ic.limit(maxImages)
    const fc = ee.FeatureCollection(
      ic.map((img) => {
        const stats = img.reduceRegion({ reducer, geometry, scale, maxPixels: 1e9, bestEffort: true })
        return ee.Feature(null, stats.set('date', img.date().format(dateFormat)))
      }),
    )
    let result
    try {
      result = await evaluate(fc, { timeoutMs: 300_000 })
    } catch (e) {
      throw new Error(normalizeEeError(e), { cause: e })
    }
    const rows = featureCollectionToRows(result)
      .map((r) => {
        const { id, ...rest } = r
        void id
        return rest
      })
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    if (!rows.length) throw new Error('時系列が空でした。期間・領域・フィルタ条件を確認してください。')
    const ds = datasetStore.add({
      title: input.name,
      source: 'gee',
      records: rows,
      meta: { reducer: reducerName, scale, region: normalizeRegion(input.region) },
      dateColumn: 'date',
    })
    log?.(`時系列データセット: ${ds.id}（${rows.length} 行）`)
    return summarizeDataset(ds)
  }

  async function eeDescribe(input) {
    const ee = geeClient.assertReady()
    const ctx = makeEeContext(ee, deps)
    const value = await runEeCode({ ee, code: input.code, ctx })
    const typeName = isEeObject(ee, value) ? eeTypeName(ee, value) : typeof value
    try {
      if (value instanceof ee.Image) {
        const info = await evaluate(
          ee.Dictionary({
            bandNames: value.bandNames(),
            nominalScale: value.select(0).projection().nominalScale(),
            crs: value.select(0).projection().crs(),
          }),
          { timeoutMs: 120_000 },
        )
        return { type: 'Image', ...info }
      }
      if (value instanceof ee.ImageCollection) {
        const first = value.first()
        const info = await evaluate(
          ee.Dictionary({
            size: value.size(),
            firstBandNames: ee.Image(first).bandNames(),
            firstDate: ee.Date(ee.Image(first).get('system:time_start')).format('YYYY-MM-dd'),
            lastDate: ee.Date(value.sort('system:time_start', false).first().get('system:time_start')).format('YYYY-MM-dd'),
            nominalScale: ee.Image(first).select(0).projection().nominalScale(),
          }),
          { timeoutMs: 120_000 },
        )
        return { type: 'ImageCollection', ...info }
      }
      if (value instanceof ee.FeatureCollection) {
        const info = await evaluate(
          ee.Dictionary({
            size: value.size(),
            columns: value.first().propertyNames(),
            firstProperties: value.first().toDictionary(),
          }),
          { timeoutMs: 120_000 },
        )
        return { type: 'FeatureCollection', ...info }
      }
    } catch (e) {
      throw new Error(normalizeEeError(e), { cause: e })
    }
    const resolved = await resolveResult(ee, value)
    return { type: typeName, value: capValue(resolved, 2000) }
  }

  return { eeRun, eeAddLayer, eeTimeSeries, eeDescribe }
}
