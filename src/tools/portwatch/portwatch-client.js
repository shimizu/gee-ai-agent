// IMF PortWatch の公開 ArcGIS FeatureServer をブラウザから直接叩くクライアント。
//
// 役割: 認証不要の公開 API から港/チョークポイントの検索・日次時系列・波及リスク・災害イベントを
//       取得する。ArcGIS は HTTP 200 でも本文に error を返すことがあるため必ず確認する。
// 関係: tools/portwatch/handlers.js が呼ぶ。fetchImpl 注入でテスト可能。
// 流用元: reference/portwatch-dashboard/src/tools/portwatch-client.js（fetchImpl 注入と
//         disruptions 取得・ページング fetchAll を追加）
export const ORG = 'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services'

export const STATIC_SERVICE = {
  port: 'PortWatch_ports_database',
  chokepoint: 'PortWatch_chokepoints_database',
}
export const DAILY_SERVICE = {
  port: 'Daily_Ports_Data',
  chokepoint: 'Daily_Chokepoints_Data',
}
// 港と要衝で指標列が異なる（docs/portwatch-api.md §6/§7）。
export const METRIC_FIELDS = {
  port: 'date,portname,portcalls,import,export',
  chokepoint: 'date,portname,n_total,capacity',
}
export const SPILL_SERVICE = {
  trade: 'spillovers_trade',
  port: 'spillovers_port_level_impact',
}
export const DISRUPTIONS_SERVICE = 'portwatch_disruptions_database'

export const MAX_RECORDS = 1000

export function escapeSql(value) {
  return String(value ?? '').replace(/'/g, "''")
}

export function buildQueryUrl(service, params) {
  const query = new URLSearchParams({ f: 'json', returnGeometry: 'false', ...params })
  return `${ORG}/${service}/FeatureServer/0/query?${query}`
}

export async function arcgisQuery(service, params, { signal, timeoutMs = 30000, fetchImpl = globalThis.fetch } = {}) {
  const url = buildQueryUrl(service, params)
  const timeoutSignal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined
  const composite =
    signal && timeoutSignal && AbortSignal.any ? AbortSignal.any([signal, timeoutSignal]) : (signal ?? timeoutSignal)

  let res
  try {
    res = await fetchImpl(url, { signal: composite })
  } catch (error) {
    if (signal?.aborted) {
      const abortError = new Error('PortWatch API 呼び出しを中断しました。', { cause: error })
      abortError.name = 'AbortError'
      throw abortError
    }
    if (timeoutSignal?.aborted) throw new Error('PortWatch API 呼び出しがタイムアウトしました。', { cause: error })
    throw new Error(`PortWatch API への接続に失敗しました: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    })
  }
  if (!res.ok) throw new Error(`PortWatch API HTTP ${res.status}（${service}）。`)
  const json = await res.json()
  if (json.error) {
    throw new Error(`ArcGIS エラー（${service}）: ${json.error.message ?? JSON.stringify(json.error)}`)
  }
  return json
}

// 港・チョークポイントを名称/国で検索し portid を特定する。
export async function searchLocations({ query = '', scope = 'any', limit = 20 } = {}, context = {}) {
  const scopes = scope === 'any' ? ['chokepoint', 'port'] : [scope]
  const q = escapeSql(String(query).trim())
  const locations = []
  for (const sc of scopes) {
    const service = STATIC_SERVICE[sc]
    if (!service) throw new Error(`scope は port / chokepoint / any: ${scope}`)
    const where = q ? `portname LIKE '%${q}%' OR country LIKE '%${q}%' OR fullname LIKE '%${q}%'` : '1=1'
    const json = await arcgisQuery(
      service,
      {
        where,
        outFields: 'portid,portname,fullname,country,ISO3,lat,lon,vessel_count_total',
        orderByFields: 'vessel_count_total DESC',
        resultRecordCount: String(Math.min(Math.max(limit, 1), 50)),
      },
      context,
    )
    for (const f of json.features ?? []) locations.push({ ...f.attributes, scope: sc })
  }
  return { count: locations.length, locations }
}

// 指定地点の日次時系列を直近 days 件取得する（昇順）。
export async function fetchMetrics({ portid, scope = 'port', days = 365 } = {}, context = {}) {
  const service = DAILY_SERVICE[scope]
  if (!service) throw new Error(`scope は port か chokepoint: ${scope}`)
  if (!portid) throw new Error('portid を指定してください。')
  const json = await arcgisQuery(
    service,
    {
      where: `portid='${escapeSql(portid)}'`,
      outFields: METRIC_FIELDS[scope],
      orderByFields: 'date DESC',
      resultRecordCount: String(Math.min(Math.max(days, 1), MAX_RECORDS)),
    },
    context,
  )
  const rows = (json.features ?? []).map((f) => f.attributes)
  rows.reverse()
  const portname = rows[0]?.portname ?? portid
  const records = rows.map((row) => {
    const rest = { ...row }
    delete rest.portname
    return rest
  })
  return { portid, scope, portname, records }
}

// 波及リスク（Spillover Simulator）。kind=trade: 国別貿易リスク額、kind=port: 影響先の港の輸送能力。
export async function fetchSpillovers(
  { portid, kind = 'trade', industry = 'Total', by = 'export', limit = 10 } = {},
  context = {},
) {
  if (!portid) throw new Error('portid を指定してください。')
  const service = SPILL_SERVICE[kind]
  if (!service) throw new Error(`kind は trade か port: ${kind}`)
  const id = escapeSql(portid)
  const cap = String(Math.min(Math.max(limit, 1), 50))

  if (kind === 'trade') {
    const sortField = by === 'import' ? 'daily_import_value_at_risk' : 'daily_export_value_at_risk'
    const json = await arcgisQuery(
      service,
      {
        where: `from_portid='${id}' AND industry='${escapeSql(industry)}'`,
        outFields: 'to_country,to_iso3,daily_export_value_at_risk,daily_import_value_at_risk',
        orderByFields: `${sortField} DESC`,
        resultRecordCount: cap,
      },
      context,
    )
    const rows = (json.features ?? []).map((f) => ({
      country: f.attributes.to_country,
      iso3: f.attributes.to_iso3,
      exportAtRisk: f.attributes.daily_export_value_at_risk,
      importAtRisk: f.attributes.daily_import_value_at_risk,
    }))
    return { kind, portid, industry, by, unit: 'US Dollars/day', rows }
  }

  const json = await arcgisQuery(
    service,
    {
      where: `from_portid='${id}'`,
      outFields:
        'to_portid,to_portname,to_country,to_lat,to_lon,daily_capacity_at_risk,relative_capacity_at_risk,average_transit_days',
      orderByFields: 'daily_capacity_at_risk DESC',
      resultRecordCount: cap,
    },
    context,
  )
  const rows = (json.features ?? []).map((f) => ({
    toPortid: f.attributes.to_portid,
    toPortname: f.attributes.to_portname,
    country: f.attributes.to_country,
    lat: f.attributes.to_lat,
    lon: f.attributes.to_lon,
    capacityAtRisk: f.attributes.daily_capacity_at_risk,
    relativeAtRiskPct: f.attributes.relative_capacity_at_risk,
    transitDays: f.attributes.average_transit_days,
  }))
  return { kind, portid, unit: 'metric tons/day', rows }
}

// 港に影響した災害イベント（GDACS 赤アラート × 港湾境界）。
export async function fetchDisruptions(
  { query = '', eventType = '', country = '', since = '', limit = 20 } = {},
  context = {},
) {
  const clauses = []
  const q = escapeSql(String(query).trim())
  if (q) clauses.push(`(eventname LIKE '%${q}%' OR affectedports LIKE '%${q}%' OR country LIKE '%${q}%')`)
  if (eventType) clauses.push(`eventtype='${escapeSql(eventType)}'`)
  if (country) clauses.push(`country LIKE '%${escapeSql(country)}%'`)
  if (since) clauses.push(`fromdate >= DATE '${escapeSql(since)}'`)
  const json = await arcgisQuery(
    DISRUPTIONS_SERVICE,
    {
      where: clauses.length ? clauses.join(' AND ') : '1=1',
      outFields:
        'eventid,eventtype,eventname,alertlevel,country,fromdate,todate,lat,long,affectedports,n_affectedports,affectedpopulation',
      orderByFields: 'fromdate DESC',
      resultRecordCount: String(Math.min(Math.max(limit, 1), 100)),
    },
    context,
  )
  const rows = (json.features ?? []).map((f) => {
    const a = f.attributes
    return {
      eventid: a.eventid,
      eventtype: a.eventtype,
      eventname: a.eventname,
      alertlevel: a.alertlevel,
      country: a.country,
      fromdate: toDateString(a.fromdate),
      todate: toDateString(a.todate),
      lat: a.lat,
      lon: a.long,
      affectedports: a.affectedports,
      nAffectedPorts: a.n_affectedports,
      affectedPopulation: a.affectedpopulation,
    }
  })
  return { count: rows.length, rows }
}

// 港の静的情報（座標など）を portid 配列で取得する。
export async function fetchLocationsByIds({ portids = [], scope = 'port' } = {}, context = {}) {
  const service = STATIC_SERVICE[scope]
  if (!service) throw new Error(`scope は port か chokepoint: ${scope}`)
  const ids = portids.filter(Boolean).map((p) => `'${escapeSql(p)}'`)
  if (!ids.length) return { count: 0, locations: [] }
  const json = await arcgisQuery(
    service,
    {
      where: `portid IN (${ids.join(',')})`,
      outFields: 'portid,portname,fullname,country,ISO3,lat,lon,vessel_count_total',
      resultRecordCount: String(Math.min(ids.length, MAX_RECORDS)),
    },
    context,
  )
  const locations = (json.features ?? []).map((f) => ({ ...f.attributes, scope }))
  return { count: locations.length, locations }
}

function toDateString(v) {
  if (v == null) return null
  if (typeof v === 'number') return new Date(v).toISOString().slice(0, 10)
  return String(v)
}
