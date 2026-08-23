// anomaly / metrics（決定論的分析）のテスト。
import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeSeries, classify, worst } from '../src/tools/portwatch/anomaly.js'
import { numericColumns, runMetricAnalysis } from '../src/tools/portwatch/metrics.js'

function series(values, start = '2025-01-01') {
  const base = new Date(start)
  return values.map((value, i) => {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    return { date: d.toISOString().slice(0, 10), value }
  })
}

test('点数不足は null、平常は ok、急落は danger', () => {
  assert.equal(analyzeSeries(series([1, 2, 3])), null)
  const flat = analyzeSeries(series(Array.from({ length: 200 }, (_, i) => 100 + (i % 5))))
  assert.equal(classify(flat), 'ok')
  const drop = analyzeSeries(series(Array.from({ length: 230 }, (_, i) => (i < 200 ? 100 + (i % 3) : 40 + (i % 3)))))
  assert.equal(classify(drop), 'danger')
  assert.ok(drop.sigma < 0)
  assert.equal(worst(['ok', 'warn', 'danger']), 'danger')
})

test('runMetricAnalysis summary / trend', () => {
  const records = series(Array.from({ length: 120 }, (_, i) => 10 + (i % 4))).map((r) => ({ date: r.date, portcalls: r.value, label: 'x' }))
  assert.deepEqual(numericColumns(records), ['portcalls'])
  const s = runMetricAnalysis({ records, operation: 'summary' })
  assert.equal(s.metrics[0].metric, 'portcalls')
  assert.equal(s.metrics[0].count, 120)
  const t = runMetricAnalysis({ records, operation: 'trend', metric: 'portcalls' })
  assert.equal(t.metrics[0].signal, 'ok')
  assert.throws(() => runMetricAnalysis({ records, operation: 'nope' }), /operation/)
})
