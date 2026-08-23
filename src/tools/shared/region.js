// region 引数（領域指定）の正規化と ee.Geometry への変換。
//
// 役割: ツール共通の region 形式を受け付ける:
//   { type:'geojson', geometry } | { type:'map_view' } | { type:'point', lon, lat, buffer_m }
//   | { type:'bbox', bounds:[w,s,e,n] } | { type:'layer', layer_id }
//   省略形: [w,s,e,n]（bbox）/ GeoJSON ジオメトリ・Feature（geojson）/ 'map_view' 文字列。
// 関係: normalizeRegion は純関数（テスト対象）。regionToEeGeometry は ee と現在の地図状態を受ける。
export function normalizeRegion(region) {
  if (region == null) return null
  if (typeof region === 'string') {
    const s = region.trim()
    if (s === 'map_view' || s === 'viewport') return { type: 'map_view' }
    // JSON 文字列（"[w,s,e,n]" や "{...}"）で来ることがあるので解釈する。
    if (/^[[{]/.test(s)) {
      try {
        return normalizeRegion(JSON.parse(s))
      } catch (e) {
        if (e instanceof SyntaxError) throw new Error(`region の文字列を JSON として解釈できません: ${region}`, { cause: e })
        throw e
      }
    }
    throw new Error(`region の文字列形式は 'map_view' か JSON（[w,s,e,n] / {type:...}）です: ${region}`)
  }
  if (Array.isArray(region)) {
    if (region.length === 4 && region.every((v) => Number.isFinite(Number(v)))) {
      return { type: 'bbox', bounds: region.map(Number) }
    }
    throw new Error('region の配列形式は [west, south, east, north] です。')
  }
  if (typeof region !== 'object') throw new Error('region の形式が不正です。')

  const t = region.type
  if (t === 'map_view') return { type: 'map_view' }
  if (t === 'bbox') {
    const b = region.bounds
    if (!Array.isArray(b) || b.length !== 4) throw new Error('bbox には bounds:[west, south, east, north] が必要です。')
    return { type: 'bbox', bounds: b.map(Number) }
  }
  if (t === 'point') {
    const lon = Number(region.lon ?? region.lng)
    const lat = Number(region.lat)
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) throw new Error('point には lon, lat が必要です。')
    const buffer = region.buffer_m != null ? Number(region.buffer_m) : 0
    return { type: 'point', lon, lat, buffer_m: Number.isFinite(buffer) ? buffer : 0 }
  }
  if (t === 'layer') {
    if (!region.layer_id) throw new Error('layer には layer_id が必要です。')
    return { type: 'layer', layer_id: String(region.layer_id) }
  }
  if (t === 'geojson') {
    if (!region.geometry) throw new Error('geojson には geometry が必要です。')
    return { type: 'geojson', geometry: unwrapGeometry(region.geometry) }
  }
  // GeoJSON 直渡し
  if (['Point', 'Polygon', 'MultiPolygon', 'LineString', 'MultiLineString', 'MultiPoint', 'Feature', 'FeatureCollection'].includes(t)) {
    return { type: 'geojson', geometry: unwrapGeometry(region) }
  }
  throw new Error(`未知の region.type: ${t}`)
}

function unwrapGeometry(g) {
  if (g?.type === 'Feature') return g.geometry
  if (g?.type === 'FeatureCollection') {
    const geoms = (g.features ?? []).map((f) => f.geometry).filter(Boolean)
    if (geoms.length === 1) return geoms[0]
    return { type: 'GeometryCollection', geometries: geoms }
  }
  return g
}

// 正規化済み region → ee.Geometry。
export function regionToEeGeometry(ee, region, { getMapView, layerStore } = {}) {
  const r = normalizeRegion(region)
  if (!r) return null
  switch (r.type) {
    case 'map_view': {
      const view = getMapView?.()
      if (!view?.bounds) throw new Error('現在の地図表示範囲を取得できません。')
      return ee.Geometry.Rectangle(view.bounds, null, false)
    }
    case 'bbox':
      return ee.Geometry.Rectangle(r.bounds, null, false)
    case 'point': {
      const p = ee.Geometry.Point([r.lon, r.lat])
      return r.buffer_m > 0 ? p.buffer(r.buffer_m) : p
    }
    case 'layer': {
      const layer = layerStore?.get?.(r.layer_id)
      if (!layer) throw new Error(`レイヤーが見つかりません: ${r.layer_id}`)
      if (layer.kind === 'vector' && layer.geojson) return ee.Geometry(unwrapGeometry(layer.geojson))
      if (layer.bounds) return ee.Geometry.Rectangle(layer.bounds, null, false)
      throw new Error(`レイヤー ${r.layer_id} から領域を作れません（ベクターレイヤーか bounds 付きレイヤーを指定）。`)
    }
    case 'geojson':
      return ee.Geometry(r.geometry)
    default:
      throw new Error(`未知の region: ${r.type}`)
  }
}

// 正規化済み region → [w,s,e,n]。bbox / map_view / layer(bounds) は同期、それ以外は ee.Geometry.bounds() を評価する。
export async function regionToBounds(ee, region, { getMapView, layerStore, evaluate } = {}) {
  const r = normalizeRegion(region)
  if (!r) return null
  if (r.type === 'bbox') return r.bounds
  if (r.type === 'map_view') {
    const view = getMapView?.()
    if (!view?.bounds) throw new Error('現在の地図表示範囲を取得できません。')
    return view.bounds
  }
  if (r.type === 'layer') {
    const layer = layerStore?.get?.(r.layer_id)
    if (layer?.bounds) return layer.bounds
  }
  if (typeof evaluate !== 'function') throw new Error('この region 形式には EE の評価が必要です。')
  const geom = regionToEeGeometry(ee, r, { getMapView, layerStore })
  const b = await evaluate(geom.bounds(), { timeoutMs: 60_000 })
  const coords = b?.coordinates?.[0]
  if (!coords) throw new Error('領域の範囲を取得できませんでした。')
  const xs = coords.map((c) => c[0])
  const ys = coords.map((c) => c[1])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}
