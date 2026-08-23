// PortWatch クライアントの URL 組み立てとエラー処理（fetchImpl 注入）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { arcgisQuery, buildQueryUrl, fetchDisruptions, fetchMetrics, searchLocations } from '../src/tools/portwatch/portwatch-client.js'

function fakeFetch(handler) {
  return async (url) => {
    const body = handler(new URL(url))
    return { ok: true, status: 200, json: async () => body }
  }
}

test('buildQueryUrl は f=json と returnGeometry=false を付ける', () => {
  const url = new URL(buildQueryUrl('Daily_Ports_Data', { where: "portid='p1'" }))
  assert.equal(url.searchParams.get('f'), 'json')
  assert.equal(url.searchParams.get('returnGeometry'), 'false')
  assert.equal(url.searchParams.get('where'), "portid='p1'")
})

test('json.error は例外になる', async () => {
  const fetchImpl = fakeFetch(() => ({ error: { message: 'bad where' } }))
  await assert.rejects(arcgisQuery('Daily_Ports_Data', { where: '1=1' }, { fetchImpl }), /ArcGIS エラー.*bad where/)
})

test('fetchMetrics は昇順・portname を除いた records を返す', async () => {
  const fetchImpl = fakeFetch((u) => {
    assert.match(u.pathname, /Daily_Ports_Data/)
    assert.equal(u.searchParams.get('orderByFields'), 'date DESC')
    return {
      features: [
        { attributes: { date: '2024-01-02', portname: 'P', portcalls: 2 } },
        { attributes: { date: '2024-01-01', portname: 'P', portcalls: 1 } },
      ],
    }
  })
  const r = await fetchMetrics({ portid: 'p1', scope: 'port', days: 10 }, { fetchImpl })
  assert.equal(r.portname, 'P')
  assert.deepEqual(r.records, [
    { date: '2024-01-01', portcalls: 1 },
    { date: '2024-01-02', portcalls: 2 },
  ])
})

test('searchLocations は scope ごとに問い合わせ、クォートをエスケープする', async () => {
  const seen = []
  const fetchImpl = fakeFetch((u) => {
    seen.push(u.searchParams.get('where'))
    return { features: [{ attributes: { portid: 'x', portname: "O'Hare" } }] }
  })
  const r = await searchLocations({ query: "O'Hare", scope: 'any', limit: 5 }, { fetchImpl })
  assert.equal(seen.length, 2)
  assert.match(seen[0], /O''Hare/)
  assert.equal(r.count, 2)
})

test('fetchDisruptions の where と日付整形', async () => {
  const fetchImpl = fakeFetch((u) => {
    assert.match(u.searchParams.get('where'), /eventtype='TC'/)
    assert.match(u.searchParams.get('where'), /fromdate >= DATE '2024-01-01'/)
    return { features: [{ attributes: { eventid: 1, eventtype: 'TC', fromdate: 1704067200000, long: 1, lat: 2 } }] }
  })
  const r = await fetchDisruptions({ eventType: 'TC', since: '2024-01-01' }, { fetchImpl })
  assert.equal(r.rows[0].fromdate, '2024-01-01')
  assert.equal(r.rows[0].lon, 1)
})
