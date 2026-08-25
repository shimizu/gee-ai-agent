// コーヒー監視カレンダー・産地・リスクプロファイル（純データ）の整合性と activeMonitors のテスト。
import test from 'node:test'
import assert from 'node:assert/strict'
import { CALENDAR, PRIORITY_ORDER, activeMonitors, formatCalendarTable, monthInRange, monthsLabel } from '../src/tools/coffee/calendar.js'
import { REGIONS, filterRegions, formatRegionsTable, getRegion, regionToBbox, regionsToFeatureCollection } from '../src/tools/coffee/regions.js'
import { RISK_PROFILES, RISK_TYPES, formatRiskRules, getRiskProfile } from '../src/tools/coffee/risk-profiles.js'

test('カレンダーは 22 行で、id 一意・月 1..12・priority/riskType/regionIds が整合する', () => {
  assert.equal(CALENDAR.length, 22)
  assert.equal(new Set(CALENDAR.map((r) => r.id)).size, CALENDAR.length)
  for (const r of CALENDAR) {
    for (const m of [r.startMonth, r.endMonth]) assert.ok(Number.isInteger(m) && m >= 1 && m <= 12, r.id)
    assert.ok(PRIORITY_ORDER.includes(r.priority), r.id)
    assert.ok(RISK_TYPES.includes(r.riskType), r.id)
    assert.ok(r.regionIds.length > 0, r.id)
    for (const id of r.regionIds) assert.ok(getRegion(id), `${r.id} → ${id}`)
  }
})

test('産地は id 一意で bbox が妥当', () => {
  assert.equal(new Set(REGIONS.map((r) => r.id)).size, REGIONS.length)
  for (const r of REGIONS) {
    const [w, s, e, n] = r.bounds
    assert.equal(r.bounds.length, 4, r.id)
    assert.ok(w < e && s < n, r.id)
    assert.ok(w >= -180 && e <= 180 && s >= -90 && n <= 90, r.id)
  }
  assert.deepEqual(regionToBbox(getRegion('BR_SUL_MINAS')), { type: 'bbox', bounds: [-46.8, -22.6, -44.4, -20.6] })
})

test('monthInRange は年またぎを扱う', () => {
  assert.ok(monthInRange(9, 9, 10) && monthInRange(10, 9, 10))
  assert.ok(!monthInRange(8, 9, 10) && !monthInRange(11, 9, 10))
  assert.ok(monthInRange(10, 10, 1) && monthInRange(12, 10, 1) && monthInRange(1, 10, 1))
  assert.ok(!monthInRange(2, 10, 1) && !monthInRange(9, 10, 1))
  for (let m = 1; m <= 12; m++) assert.ok(monthInRange(m, 1, 12))
  assert.ok(monthInRange(5, 5, 5) && !monthInRange(6, 5, 5))
  assert.equal(monthsLabel({ startMonth: 10, endMonth: 1 }), '10〜1月（年またぎ）')
  assert.equal(monthsLabel({ startMonth: 1, endMonth: 12 }), '通年')
  assert.equal(monthsLabel({ startMonth: 5, endMonth: 5 }), '5月')
})

test('activeMonitors は月・国・リスクで絞り priority 順に返す', () => {
  const sep = activeMonitors({ month: 9 })
  assert.equal(sep[0].id, 'BR_ARABICA_FLOWERING')
  assert.equal(sep[0].priority, 'critical')
  assert.equal(sep[0].months, '9〜10月')
  assert.ok(activeMonitors({ month: 12 }).some((r) => r.id === 'VN_HARVEST'))
  assert.ok(activeMonitors({ month: 1 }).some((r) => r.id === 'VN_HARVEST'))
  assert.ok(!activeMonitors({ month: 2 }).some((r) => r.id === 'VN_HARVEST'))

  const br = activeMonitors({ month: 7, country: 'brazil' })
  assert.ok(br.length > 0)
  for (const r of br) assert.equal(r.country, 'Brazil')
  assert.equal(activeMonitors({ month: 7, risk: 'frost' }).map((r) => r.id).join(), 'BR_FROST')
  assert.ok(activeMonitors({ month: 10, country: 'Honduras' }).some((r) => r.id === 'CA_HURRICANE'))
  // 産地名（Dak Lak）は regionLookup 経由で一致する
  assert.ok(activeMonitors({ month: 11, country: 'dak lak', regionLookup: getRegion }).some((r) => r.id === 'VN_HARVEST'))

  assert.throws(() => activeMonitors({ month: 0 }))
  assert.throws(() => activeMonitors({ month: 13 }))
  const def = activeMonitors({ now: new Date(2026, 8, 1) })
  assert.equal(def[0].id, 'BR_ARABICA_FLOWERING')
})

test('filterRegions と FeatureCollection 変換', () => {
  assert.equal(filterRegions().length, REGIONS.length)
  assert.equal(filterRegions({ country: 'Brazil' }).length, 5)
  assert.equal(filterRegions({ ids: ['CO_CENTRAL'] })[0].name, 'Antioquia – Caldas')
  assert.throws(() => filterRegions({ ids: ['NOPE'] }), /未知の産地 ID: NOPE/)
  const fc = regionsToFeatureCollection(REGIONS)
  assert.equal(fc.type, 'FeatureCollection')
  for (const f of fc.features) {
    assert.equal(f.geometry.type, 'Polygon')
    const ring = f.geometry.coordinates[0]
    assert.equal(ring.length, 5)
    assert.deepEqual(ring[0], ring[4])
    assert.ok(f.properties.region_id)
  }
})

test('リスクプロファイルと表生成', () => {
  assert.deepEqual(RISK_TYPES, ['drought', 'frost', 'excess_rain', 'storm', 'structural'])
  for (const [type, p] of Object.entries(RISK_PROFILES)) {
    assert.ok(p.label, type)
    for (const d of p.datasets) assert.ok(d.id && Array.isArray(d.bands), `${type} ${d.id}`)
    for (const t of p.thresholds) assert.ok(t.level && t.rule, type)
  }
  assert.equal(getRiskProfile('frost').thresholds[0].level, 'WATCH')
  assert.throws(() => getRiskProfile('foo'))
  assert.match(formatRiskRules(), /frost（霜・寒波）: ECMWF\/ERA5_LAND\/DAILY_AGGR/)
  assert.equal(formatCalendarTable().split('\n').length, 22 + 2)
  assert.equal(formatRegionsTable().split('\n').length, REGIONS.length + 2)
  assert.match(formatCalendarTable(), /\| VN_HARVEST \| 10〜1月（年またぎ） \| Vietnam /)
})
