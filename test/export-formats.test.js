// export-formats（CSV/JSON/GeoJSON 変換）のテスト。
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDatasetExport, datasetHasGeo, datasetToGeoJson, layerToGeoJson, safeFilename } from '../src/data/export-formats.js'

const ds = { id: 'ds_001', title: '港/日次: a', columns: ['date', 'v', 'lon', 'lat'], records: [{ date: '2024-01-01', v: 1, lon: 139, lat: 35 }] }

test('CSV / JSON / GeoJSON', () => {
  const csv = buildDatasetExport(ds, 'csv')
  assert.match(csv.text, /^date,v,lon,lat\n2024-01-01,1,139,35$/)
  assert.equal(csv.filename, '港_日次:_a.csv'.replace(':', '_'))
  const json = JSON.parse(buildDatasetExport(ds, 'json').text)
  assert.equal(json.records.length, 1)
  const gj = JSON.parse(buildDatasetExport(ds, 'geojson').text)
  assert.equal(gj.features[0].geometry.coordinates[0], 139)
  assert.equal(datasetHasGeo(ds), true)
  assert.equal(datasetToGeoJson({ records: [{ a: 1 }], columns: ['a'] }), null)
  assert.throws(() => buildDatasetExport({ records: [{ a: 1 }], columns: ['a'] }, 'geojson'), /GeoJSON/)
})

test('safeFilename / layerToGeoJson', () => {
  assert.equal(safeFilename('a/b:c?.tif', 'tif'), 'a_b_c_.tif.tif')
  assert.equal(safeFilename('', 'csv'), 'export.csv')
  assert.equal(layerToGeoJson({ geojson: { type: 'FeatureCollection', features: [] } }), '{"type":"FeatureCollection","features":[]}')
  assert.equal(layerToGeoJson({}), null)
})
