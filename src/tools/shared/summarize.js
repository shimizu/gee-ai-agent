// ツール結果を LLM 向けに要約するユーティリティ（純関数）。
//
// 役割: 行データをそのまま返さず、件数・列・サンプルに絞る。文字数キャップで履歴肥大を防ぐ。
// 関係: tools/* のハンドラが使う。
export const LLM_SAMPLE_ROWS = 5
export const RESULT_CHAR_CAP = 6000

export function sampleRows(rows, n = LLM_SAMPLE_ROWS) {
  return rows.slice(0, n).map((r) => truncateRow(r))
}

// 1 行の長い文字列値を短くする。
export function truncateRow(row, maxChars = 200) {
  if (!row || typeof row !== 'object') return row
  const out = {}
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === 'string' && v.length > maxChars) out[k] = `${v.slice(0, maxChars)}…`
    else if (v && typeof v === 'object') {
      const s = JSON.stringify(v)
      out[k] = s.length > maxChars ? `${s.slice(0, maxChars)}…` : v
    } else out[k] = v
  }
  return out
}

// データセットの要約（ツール結果の共通形）。
export function summarizeDataset(ds, { sample = LLM_SAMPLE_ROWS } = {}) {
  return {
    datasetId: ds.id,
    title: ds.title,
    source: ds.source,
    recordCount: ds.records.length,
    columns: ds.columns,
    dateRange: ds.dateRange ?? null,
    meta: ds.meta ?? undefined,
    sample: sampleRows(ds.records, sample),
  }
}

// 任意の値を文字数上限つきで返す（超過時は打ち切りと注意を付ける）。
export function capValue(value, cap = RESULT_CHAR_CAP) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? null)
  if (text.length <= cap) return value
  return {
    truncated: true,
    note: `結果が大きいため ${cap} 文字で打ち切りました。大きな結果は save_as_dataset で保存するか、集計してから返してください。`,
    preview: text.slice(0, cap),
  }
}

// 値が「行配列」（オブジェクトの配列）かどうか。
export function isRowArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every((v) => v && typeof v === 'object' && !Array.isArray(v))
}

// GeoJSON FeatureCollection → 行配列（properties + 点なら lon/lat）。
export function featureCollectionToRows(fc) {
  const features = Array.isArray(fc?.features) ? fc.features : []
  return features.map((f, i) => {
    const row = { ...(f.properties ?? {}) }
    const g = f.geometry
    if (g?.type === 'Point' && Array.isArray(g.coordinates)) {
      row.lon = g.coordinates[0]
      row.lat = g.coordinates[1]
    } else if (g?.type) {
      row.geometry_type = g.type
    }
    if (row.id == null && f.id != null) row.id = f.id
    if (row.id == null) row.id = i
    return row
  })
}

// 行配列（lon/lat 列）→ GeoJSON FeatureCollection（点）。
export function rowsToPointFeatureCollection(rows, { lonCol = 'lon', latCol = 'lat' } = {}) {
  const features = []
  for (const r of rows) {
    const lon = Number(r?.[lonCol])
    const lat = Number(r?.[latCol])
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue
    const props = { ...r }
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: props })
  }
  return { type: 'FeatureCollection', features }
}

// GeoJSON の bbox [w,s,e,n]。
export function geojsonBounds(geojson) {
  let w = Infinity
  let s = Infinity
  let e = -Infinity
  let n = -Infinity
  const visit = (coords) => {
    if (typeof coords[0] === 'number') {
      const [x, y] = coords
      if (x < w) w = x
      if (x > e) e = x
      if (y < s) s = y
      if (y > n) n = y
      return
    }
    for (const c of coords) visit(c)
  }
  const geoms = []
  if (geojson?.type === 'FeatureCollection') for (const f of geojson.features ?? []) if (f?.geometry) geoms.push(f.geometry)
  else if (geojson?.type === 'Feature') geoms.push(geojson.geometry)
  else if (geojson?.type) geoms.push(geojson)
  for (const g of geoms) {
    if (!g) continue
    if (g.type === 'GeometryCollection') for (const gg of g.geometries ?? []) visit(gg.coordinates)
    else if (g.coordinates) visit(g.coordinates)
  }
  if (!Number.isFinite(w)) return null
  return [w, s, e, n]
}

// GeoJSON の代表ジオメトリ種別と件数。
export function geojsonSummary(geojson) {
  const features = geojson?.type === 'FeatureCollection' ? geojson.features ?? [] : geojson ? [geojson] : []
  const counts = {}
  for (const f of features) {
    const t = f?.geometry?.type ?? f?.type ?? 'Unknown'
    counts[t] = (counts[t] ?? 0) + 1
  }
  const geomType = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  return { featureCount: features.length, geomType, bounds: geojsonBounds(geojson) }
}
