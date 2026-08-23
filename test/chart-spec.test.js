// chart-spec（show_chart 入力の検証・正規化）の単体テスト。
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildHistogram, guessXType, thin, validateChartSpec } from '../src/data/chart-spec.js'

const rows = [
  { date: '2024-01-03', a: 3, b: 1 },
  { date: '2024-01-01', a: 1, b: 2 },
  { date: '2024-01-02', a: 2, b: null },
]

test('time 軸は昇順にソートされ、series が正規化される', () => {
  const { spec, rows: out } = validateChartSpec({ type: 'line', x: 'date', series: [{ key: 'a' }, 'b'] }, rows)
  assert.equal(spec.xType, 'time')
  assert.deepEqual(out.map((r) => r.date), ['2024-01-01', '2024-01-02', '2024-01-03'])
  assert.deepEqual(spec.series.map((s) => s.key), ['a', 'b'])
  assert.equal(spec.series[1].label, 'b')
})

test('存在しない列はエラー', () => {
  assert.throws(() => validateChartSpec({ type: 'line', x: 'nope', y: 'a' }, rows), /x 列/)
  assert.throws(() => validateChartSpec({ type: 'line', x: 'date', y: 'zzz' }, rows), /series 列/)
})

test('histogram は bin 行に変換される', () => {
  const values = Array.from({ length: 100 }, (_, i) => ({ v: i }))
  const { spec, rows: out } = validateChartSpec({ type: 'histogram', x: 'v', bins: 10 }, values)
  assert.equal(out.length, 10)
  assert.equal(out.reduce((s, r) => s + r.count, 0), 100)
  assert.deepEqual(spec.series, [{ key: 'count', label: '件数' }])
})

test('2000 行超は間引かれ warnings が付く', () => {
  const many = Array.from({ length: 5000 }, (_, i) => ({ x: i, y: i * 2 }))
  const { rows: out, warnings } = validateChartSpec({ type: 'line', x: 'x', y: 'y' }, many)
  assert.equal(out.length, 2000)
  assert.equal(out[0].x, 0)
  assert.equal(out.at(-1).x, 4999)
  assert.ok(warnings.some((w) => /間引き/.test(w)))
})

test('guessXType / thin / buildHistogram', () => {
  assert.equal(guessXType([{ d: '2024-05' }], 'd'), 'time')
  assert.equal(guessXType([{ d: 1700000000000 }], 'd'), 'time')
  assert.equal(guessXType([{ d: 12 }], 'd'), 'number')
  assert.equal(guessXType([{ d: 'Japan' }], 'd'), 'category')
  assert.equal(thin([1, 2, 3, 4, 5], 3).length, 3)
  const h = buildHistogram([0, 1, 2, 3, 4], 2)
  assert.deepEqual(h.map((b) => b.count), [2, 3])
})
