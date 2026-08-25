// コーヒー監視ツールのハンドラ。
//
// 役割: 監視カレンダー・産地・リスクプロファイル（純データ）を LLM 向けに整形して返す。EE は呼ばない（未ログインでも動く）。
// 関係: index.js が register。deps は { addVectorLayer, fitBounds, session, log, now? }（now はテスト用の任意注入）。
import { activeMonitors } from './calendar.js'
import { filterRegions, getRegion, regionsToFeatureCollection, regionToBbox } from './regions.js'
import { getRiskProfile } from './risk-profiles.js'
import { geojsonSummary } from '../shared/summarize.js'

const DEFAULT_COLOR = [111, 78, 55]

export function makeCoffeeHandlers(deps) {
  const { log } = deps
  const now = () => (typeof deps.now === 'function' ? deps.now() : new Date())

  async function listMonitors(input = {}) {
    const rows = activeMonitors({ month: input.month, country: input.country, risk: input.risk, now: now(), regionLookup: getRegion })
    const month = input.month ?? now().getMonth() + 1
    const monitors = rows.map((r) => ({
      id: r.id,
      months: r.months,
      country: r.country,
      region: r.region,
      species: r.species,
      stage: r.stage,
      risk: r.risk,
      riskType: r.riskType,
      priority: r.priority,
      note: r.note || undefined,
      regions: r.regionIds.map((id) => {
        const g = getRegion(id)
        return { id, name: g.name, species: g.species, region: regionToBbox(g) }
      }),
    }))
    const profiles = {}
    if (input.include_profiles !== false) {
      for (const r of rows) if (!profiles[r.riskType]) profiles[r.riskType] = getRiskProfile(r.riskType)
    }
    log?.(`coffee: ${month} 月の監視ジョブ ${monitors.length} 件`)
    return {
      month,
      count: monitors.length,
      monitors,
      profiles,
      ...(monitors.length ? {} : { hint: 'その条件の監視ジョブはありません。month・country・risk を変えて再検索してください。' }),
      notes: [
        '異常度は絶対値ではなく平年比・percentile で判断する（スキル「平年比較の型」）。',
        '各データセットの最終収録日（dataset_latest_date）を必ず併記する。',
        'このアプリは単発分析。Risk Score の日次蓄積・バックテストは対象外。',
      ],
    }
  }

  async function showRegions(input = {}) {
    const regions = filterRegions({ ids: input.region_ids, country: input.country })
    if (!regions.length) throw new Error(`該当する産地がありません（country: ${input.country}）。`)
    const geojson = regionsToFeatureCollection(regions)
    const summary = geojsonSummary(geojson)
    const color = Array.isArray(input.color) && input.color.length === 3 ? input.color.map(Number) : DEFAULT_COLOR
    const layer = deps.addVectorLayer({
      name: input.name || 'コーヒー産地',
      geojson,
      style: { color, fillAlpha: 50 },
      originPrompt: deps.session?.originPrompt ?? '',
      ...summary,
    })
    if (input.fit_bounds !== false && summary.bounds) deps.fitBounds(summary.bounds)
    return {
      layerId: layer.layerId,
      name: layer.name,
      featureCount: summary.featureCount,
      regions: regions.map(({ id, country, name, species, bounds }) => ({ id, country, name, species, bounds })),
    }
  }

  return { listMonitors, showRegions }
}
