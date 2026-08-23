// 地図・レイヤー操作ツールの実装。
import { COLORMAP_NAMES } from '../../gee/pipeline.js'
import { geojsonBounds, geojsonSummary, rowsToPointFeatureCollection } from '../shared/summarize.js'

const MAX_FEATURES = 2000

export function summarizeLayer(layer) {
  const base = {
    layerId: layer.layerId,
    name: layer.name,
    kind: layer.kind,
    visible: layer.visible !== false,
    opacity: layer.opacity ?? 1,
  }
  if (layer.kind === 'ee-raster') {
    return {
      ...base,
      mode: layer.spec?.mode,
      bandNames: layer.bandNames,
      bandIds: layer.runtime?.bandIds,
      vis: layer.spec?.mode === 'png' ? layer.spec?.vis : undefined,
      colormap: layer.spec?.mode === 'raw' ? layer.spec?.colormap : undefined,
      colormapReversed: layer.spec?.mode === 'raw' ? layer.spec?.colormapReversed : undefined,
      rescale: layer.spec?.mode === 'raw' ? layer.spec?.rescale : undefined,
      bandMath: layer.spec?.bandMath ?? undefined,
      status: layer.runtime?.status,
      error: layer.runtime?.error,
    }
  }
  return {
    ...base,
    geomType: layer.geomType,
    featureCount: layer.featureCount,
    bounds: layer.bounds,
    datasetId: layer.datasetId ?? undefined,
  }
}

export function makeMapHandlers(deps) {
  const { layerStore, datasetStore } = deps

  function listLayers() {
    const layers = layerStore.list()
    return { count: layers.length, layers: layers.map(summarizeLayer) }
  }

  function removeLayer({ layer_id }) {
    const ok = deps.removeLayer(layer_id)
    if (!ok) throw new Error(`レイヤーが見つかりません: ${layer_id}`)
    return { removed: layer_id }
  }

  function updateLayerStyle(input) {
    const layer = layerStore.get(input.layer_id)
    if (!layer) throw new Error(`レイヤーが見つかりません: ${input.layer_id}`)
    const patch = {}
    if (input.opacity != null) patch.opacity = Math.min(1, Math.max(0, Number(input.opacity)))
    if (input.visible != null) patch.visible = Boolean(input.visible)
    if (input.name) patch.name = String(input.name)
    const specPatch = {}
    if (layer.kind === 'ee-raster' && layer.spec?.mode === 'raw') {
      if (input.colormap != null) {
        const cm = String(input.colormap).toLowerCase()
        if (!COLORMAP_NAMES.includes(cm)) throw new Error(`未知の colormap: ${input.colormap}`)
        specPatch.colormap = cm
      }
      if (input.colormap_reversed != null) specPatch.colormapReversed = Boolean(input.colormap_reversed)
      if (Array.isArray(input.rescale) && input.rescale.length === 2) specPatch.rescale = input.rescale.map(Number)
    } else if (input.colormap != null || input.rescale != null) {
      throw new Error('colormap / rescale は raw モードのラスターレイヤーでのみ変更できます。png は ee_add_layer を同名で呼び直してください。')
    }
    if (layer.kind === 'vector') {
      const style = { ...(layer.style ?? {}) }
      if (Array.isArray(input.color) && input.color.length === 3) style.color = input.color.map(Number)
      if (input.radius != null) style.radius = Number(input.radius)
      patch.style = style
    }
    if (Object.keys(patch).length) deps.updateLayer(layer.layerId, patch)
    if (Object.keys(specPatch).length) deps.updateLayerSpec(layer.layerId, specPatch)
    return summarizeLayer(layerStore.get(layer.layerId))
  }

  function getMapView() {
    const view = deps.getMapView()
    if (!view) throw new Error('地図がまだ初期化されていません。')
    return view
  }

  function fitBounds(input) {
    if (Array.isArray(input.bounds) && input.bounds.length === 4) {
      deps.fitBounds(input.bounds.map(Number))
      return { fitted: input.bounds }
    }
    if (input.layer_id) {
      const layer = layerStore.get(input.layer_id)
      if (!layer) throw new Error(`レイヤーが見つかりません: ${input.layer_id}`)
      if (!layer.bounds) throw new Error('このレイヤーは範囲（bounds）を持ちません。bounds を直接指定してください。')
      deps.fitBounds(layer.bounds)
      return { fitted: layer.bounds }
    }
    if (input.dataset_id) {
      const ds = datasetStore.get(input.dataset_id)
      const fc = rowsToPointFeatureCollection(ds.records)
      const b = geojsonBounds(fc)
      if (!b) throw new Error('データセットに lon/lat 列がありません。')
      deps.fitBounds(b)
      return { fitted: b }
    }
    throw new Error('bounds / layer_id / dataset_id のいずれかを指定してください。')
  }

  function addVectorLayer(input) {
    let geojson = input.geojson ?? null
    let datasetId = null
    if (!geojson && input.dataset_id) {
      const ds = datasetStore.get(input.dataset_id)
      datasetId = ds.id
      geojson = deps.getDatasetGeojson?.(ds.id) ?? null
      if (!geojson) {
        geojson = rowsToPointFeatureCollection(ds.records, {
          lonCol: input.lon_col ?? 'lon',
          latCol: input.lat_col ?? 'lat',
        })
        if (!geojson.features.length) {
          throw new Error(`データセット ${ds.id} から点を作れません（lon/lat 列が無いか空）。lon_col / lat_col を指定してください。`)
        }
      }
    }
    if (!geojson) throw new Error('geojson か dataset_id を指定してください。')
    if (geojson.type === 'Feature') geojson = { type: 'FeatureCollection', features: [geojson] }
    if (geojson.type !== 'FeatureCollection') geojson = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: geojson, properties: {} }] }
    if (geojson.features.length > MAX_FEATURES) {
      throw new Error(`地物数が多すぎます（${geojson.features.length} > ${MAX_FEATURES}）。集約するか範囲を絞ってください。`)
    }
    const summary = geojsonSummary(geojson)
    const layer = deps.addVectorLayer({
      name: input.name,
      geojson,
      datasetId,
      style: {
        color: Array.isArray(input.color) && input.color.length === 3 ? input.color.map(Number) : undefined,
        radius: input.radius != null ? Number(input.radius) : 6,
      },
      originPrompt: deps.session?.originPrompt ?? '',
      ...summary,
    })
    if (input.fit_bounds !== false && summary.bounds) deps.fitBounds(padBounds(summary.bounds))
    return summarizeLayer(layer)
  }

  return { listLayers, removeLayer, updateLayerStyle, getMapView, fitBounds, addVectorLayer }
}

// 点が 1 つしかない場合などに bounds をわずかに広げる。
function padBounds([w, s, e, n]) {
  const dx = e - w < 0.01 ? 0.05 : 0
  const dy = n - s < 0.01 ? 0.05 : 0
  return [w - dx, s - dy, e + dx, n + dy]
}
