// PortWatch ツールの実装。
import {
  fetchDisruptions,
  fetchLocationsByIds,
  fetchMetrics,
  fetchSpillovers,
  searchLocations,
} from './portwatch-client.js'
import { geojsonSummary, rowsToPointFeatureCollection, summarizeDataset } from '../shared/summarize.js'

export function makePortwatchHandlers(deps) {
  const { datasetStore, log } = deps

  async function search(input, context) {
    return searchLocations(input, context)
  }

  async function fetchMetricsTool(input, context) {
    const { portid, scope, portname, records } = await fetchMetrics(input, context)
    if (!records.length) throw new Error(`portid ${portid} の日次データが見つかりません。`)
    const ds = datasetStore.add({
      title: `${portname}（${scope === 'port' ? '港' : 'チョークポイント'}）日次`,
      source: 'portwatch',
      records,
      meta: { portid, scope, portname },
      dateColumn: 'date',
    })
    log?.(`PortWatch 取得: ${ds.id}（${records.length} 行）`)
    return { portid, scope, portname, ...summarizeDataset(ds) }
  }

  async function spillovers(input, context) {
    const result = await fetchSpillovers(input, context)
    if (input.save_as_dataset && result.rows.length) {
      const ds = datasetStore.add({
        title: `波及リスク ${input.portid}（${result.kind}）`,
        source: 'portwatch',
        records: result.rows,
        meta: { portid: input.portid, kind: result.kind, unit: result.unit },
      })
      return { ...result, rows: undefined, ...summarizeDataset(ds) }
    }
    return result
  }

  async function disruptions(input, context) {
    const result = await fetchDisruptions(
      {
        query: input.query,
        eventType: input.event_type,
        country: input.country,
        since: input.since,
        limit: input.limit,
      },
      context,
    )
    if (input.save_as_dataset && result.rows.length) {
      const ds = datasetStore.add({
        title: '港湾の災害イベント',
        source: 'portwatch',
        records: result.rows,
        dateColumn: 'fromdate',
      })
      return { count: result.count, ...summarizeDataset(ds) }
    }
    return result
  }

  async function showLocations(input, context) {
    let locations
    if (Array.isArray(input.portids) && input.portids.length) {
      const res = await fetchLocationsByIds({ portids: input.portids, scope: input.scope ?? 'port' }, context)
      locations = res.locations
    } else if (input.query) {
      const res = await searchLocations({ query: input.query, scope: input.scope ?? 'any', limit: input.limit ?? 20 }, context)
      locations = res.locations
    } else {
      throw new Error('portids か query を指定してください。')
    }
    if (!locations.length) throw new Error('該当する港が見つかりません。')
    const geojson = rowsToPointFeatureCollection(locations)
    const summary = geojsonSummary(geojson)
    const layer = deps.addVectorLayer({
      name: input.name || 'PortWatch 港',
      geojson,
      style: { color: [46, 184, 212], radius: 7 },
      originPrompt: deps.session?.originPrompt ?? '',
      ...summary,
    })
    if (input.fit_bounds !== false && summary.bounds) deps.fitBounds(summary.bounds)
    return {
      layerId: layer.layerId,
      name: layer.name,
      featureCount: summary.featureCount,
      locations: locations.map((l) => ({ portid: l.portid, portname: l.portname, country: l.country, lat: l.lat, lon: l.lon })),
    }
  }

  return { search, fetchMetricsTool, spillovers, disruptions, showLocations }
}
