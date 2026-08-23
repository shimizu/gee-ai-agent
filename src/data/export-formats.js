// データセット / ベクターレイヤーの書き出し形式（純関数）。
//
// 役割: CSV / JSON / GeoJSON への変換とファイル名の安全化。ダウンロード自体は utils/download.js。
import { rowsToCsv } from '../utils/download.js'
import { rowsToPointFeatureCollection } from '../tools/shared/summarize.js'

export function safeFilename(name, ext) {
  const base = String(name ?? 'export')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80)
  return ext ? `${base || 'export'}.${ext.replace(/^\./, '')}` : base || 'export'
}

export function datasetToCsv(ds) {
  return rowsToCsv(ds.records ?? [], ds.columns ?? [])
}

export function datasetToJson(ds) {
  return JSON.stringify(
    { id: ds.id, title: ds.title, source: ds.source, columns: ds.columns, dateRange: ds.dateRange ?? null, meta: ds.meta ?? null, records: ds.records ?? [] },
    null,
    1,
  )
}

// GeoJSON にできなければ null（lon/lat 列も geojson も無い）。
export function datasetToGeoJson(ds, { lonCol = 'lon', latCol = 'lat' } = {}) {
  if (ds.geojson?.type) return JSON.stringify(ds.geojson)
  const fc = rowsToPointFeatureCollection(ds.records ?? [], { lonCol, latCol })
  return fc.features.length ? JSON.stringify(fc) : null
}

export function datasetHasGeo(ds) {
  if (ds?.geojson?.type) return true
  const cols = ds?.columns ?? []
  return cols.includes('lon') && cols.includes('lat')
}

export function layerToGeoJson(layer) {
  if (!layer?.geojson) return null
  return JSON.stringify(layer.geojson)
}

// { text, mime, filename } を返す。
export function buildDatasetExport(ds, format) {
  switch (format) {
    case 'csv':
      return { text: datasetToCsv(ds), mime: 'text/csv;charset=utf-8', filename: safeFilename(ds.title || ds.id, 'csv') }
    case 'json':
      return { text: datasetToJson(ds), mime: 'application/json', filename: safeFilename(ds.title || ds.id, 'json') }
    case 'geojson': {
      const text = datasetToGeoJson(ds)
      if (!text) throw new Error('このデータセットは GeoJSON にできません（lon/lat 列がありません）。')
      return { text, mime: 'application/geo+json', filename: safeFilename(ds.title || ds.id, 'geojson') }
    }
    default:
      throw new Error(`未知の形式: ${format}`)
  }
}
