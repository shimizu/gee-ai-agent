// レイヤー操作の結線フック。
//
// 役割: LayerStore の単一インスタンスを所有し、描画状態（layers）の購読と操作（ラスター/ベクターの
//       追加・削除・表示切替・スタイル更新・ズーム・再作成・全消去）を返す。ラスターの runtime
//       （タイル URL / getTileData）は gee/layer-factory で作り、GEE ready 後に復元レイヤーを再作成する。
// 関係: App が fitBounds / getMapView / log と GEE クライアントを注入する。ツール層は
//       addRasterLayer / addVectorLayer / removeLayer / updateLayer / updateLayerSpec を deps として受ける。
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { LayerStore } from '../data/layer-store.js'
import { buildRasterRuntime } from '../gee/layer-factory.js'
import { makeEeContext } from '../tools/gee/handlers.js'

const layerStore = new LayerStore()

export function useLayerActions({ geeClient, geeReady, tileCache, getMapView, fitBounds, log }) {
  const layers = useSyncExternalStore(layerStore.subscribe, layerStore.getSnapshot)
  const restoringRef = useRef(false)

  // ラスター runtime を作って layer に反映する（新規・置換・復元・再作成で共用）。
  const buildAndApply = useCallback(
    async (layerId, spec) => {
      const ee = geeClient.assertReady()
      const ctx = makeEeContext(ee, { getMapView, log })
      layerStore.update(layerId, { runtime: { status: 'loading' } })
      tileCache.clearLayer(layerId)
      try {
        const runtime = await buildRasterRuntime({ ee, spec, layerId, ctx, geeClient, tileCache })
        layerStore.update(layerId, { runtime, bandNames: runtime.bandNames })
        return layerStore.get(layerId)
      } catch (e) {
        const message = String(e?.message ?? e)
        layerStore.update(layerId, { runtime: { status: 'error', error: message } })
        throw e
      }
    },
    [geeClient, getMapView, log, tileCache],
  )

  // { name, spec, opacity, originPrompt } → 追加（同名があれば置き換え）。
  const addRasterLayer = useCallback(
    async ({ name, spec, opacity, originPrompt }) => {
      const existing = layerStore.list().find((l) => l.kind === 'ee-raster' && l.name === name)
      const layerId = existing?.layerId ?? layerStore.nextId()
      const base = {
        layerId,
        kind: 'ee-raster',
        name,
        visible: true,
        opacity: opacity != null ? Math.min(1, Math.max(0, Number(opacity))) : (existing?.opacity ?? 1),
        spec,
        bandNames: existing?.bandNames ?? [],
        originPrompt: originPrompt ?? '',
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        runtime: { status: 'loading' },
      }
      if (existing) layerStore.update(layerId, base)
      else layerStore.add(base)
      log?.(`${existing ? 'レイヤー置換' : 'レイヤー追加'}: ${name}（${spec.mode}）`)
      try {
        const layer = await buildAndApply(layerId, spec)
        log?.(`レイヤー準備完了: ${name} bands=[${layer.bandNames.join(',')}]`)
        return layer
      } catch (e) {
        log?.(`レイヤー作成失敗: ${name}: ${String(e?.message ?? e)}`)
        if (!existing) layerStore.remove(layerId)
        throw e
      }
    },
    [buildAndApply, log],
  )

  // { name, geojson, datasetId, style, geomType, featureCount, bounds, originPrompt }
  const addVectorLayer = useCallback(
    ({ name, geojson, datasetId = null, style = {}, geomType, featureCount, bounds, originPrompt }) => {
      const existing = layerStore.list().find((l) => l.kind === 'vector' && l.name === name)
      const layerId = existing?.layerId ?? layerStore.nextId()
      const layer = {
        layerId,
        kind: 'vector',
        name,
        visible: true,
        opacity: existing?.opacity ?? 1,
        geojson,
        datasetId,
        geomType,
        featureCount,
        bounds,
        style: { color: style.color ?? existing?.style?.color ?? layerStore.nextColor(), radius: style.radius ?? 6, lineWidth: 2 },
        originPrompt: originPrompt ?? '',
        createdAt: existing?.createdAt ?? new Date().toISOString(),
      }
      if (existing) {
        layerStore.remove(layerId)
        layerStore.add(layer)
      } else layerStore.add(layer)
      log?.(`ベクターレイヤー追加: ${name}（${featureCount} 地物）`)
      return layer
    },
    [log],
  )

  const removeLayer = useCallback(
    (layerId) => {
      const removed = layerStore.remove(layerId)
      if (removed) {
        tileCache.clearLayer(layerId)
        log?.(`レイヤー削除: ${removed.name}`)
      }
      return Boolean(removed)
    },
    [log, tileCache],
  )

  const updateLayer = useCallback((layerId, patch) => layerStore.update(layerId, patch), [])
  const updateLayerSpec = useCallback((layerId, specPatch) => layerStore.updateSpec(layerId, specPatch), [])
  const toggleLayer = useCallback((layerId) => layerStore.toggle(layerId), [])

  const zoomToLayer = useCallback(
    (layerId) => {
      const layer = layerStore.get(layerId)
      if (layer?.bounds) fitBounds(layer.bounds)
    },
    [fitBounds],
  )

  // 再作成（mapid 失効・エラー・復元）。
  const rebuildLayer = useCallback(
    async (layerId) => {
      const layer = layerStore.get(layerId)
      if (!layer || layer.kind !== 'ee-raster') return null
      try {
        return await buildAndApply(layerId, layer.spec)
      } catch (e) {
        log?.(`レイヤー再作成失敗: ${layer.name}: ${String(e?.message ?? e)}`)
        return null
      }
    },
    [buildAndApply, log],
  )

  // タイル取得エラーが続いたら stale にして UI から再作成できるようにする。
  const markLayerStale = useCallback((layerId, error) => {
    const layer = layerStore.get(layerId)
    if (!layer || layer.runtime?.status !== 'ready') return
    layerStore.update(layerId, { runtime: { ...layer.runtime, status: 'stale', error: String(error?.message ?? error ?? '') } })
  }, [])

  const clearLayers = useCallback(() => {
    layerStore.clear()
    tileCache.clear()
  }, [tileCache])

  // GEE ready になったら、復元待ち（restoring）のラスターを順に再作成する。
  useEffect(() => {
    if (!geeReady || restoringRef.current) return
    const pending = layerStore.list().filter((l) => l.kind === 'ee-raster' && l.runtime?.status === 'restoring')
    if (!pending.length) return
    restoringRef.current = true
    ;(async () => {
      for (const l of pending) {
        log?.(`レイヤー復元: ${l.name}`)
        await rebuildLayer(l.layerId)
      }
      restoringRef.current = false
    })()
  }, [geeReady, rebuildLayer, log])

  return {
    layerStore,
    layers,
    addRasterLayer,
    addVectorLayer,
    removeLayer,
    updateLayer,
    updateLayerSpec,
    toggleLayer,
    zoomToLayer,
    rebuildLayer,
    markLayerStale,
    clearLayers,
  }
}
