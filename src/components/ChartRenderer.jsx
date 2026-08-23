// チャート描画本体（Recharts）。
//
// 役割: chart-spec.js が正規化した spec と rows を受け、type に応じて Line/Area/Bar/Scatter を描く。
//       カード（compact）とダイアログ（full）で共用。色は CSS 変数（--chart-series-N 等）から読む。
// 関係: ChartCard / ChartDialog が使う。データの検証は chart-spec.js 側で済んでいる前提。
import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatNumber } from '../utils/format.js'

// dataviz スキルの検証済みダーク系列色（参照パレットの dark 列）。
const FALLBACK_SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9']

function cssVar(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    return v || fallback
  } catch {
    return fallback
  }
}

function useChartColors() {
  return useMemo(
    () => ({
      grid: cssVar('--chart-grid', '#2c2c2a'),
      axis: cssVar('--chart-axis', '#383835'),
      text: cssVar('--chart-text', '#898781'),
      tooltipBg: cssVar('--color-surface', '#1a1a19'),
      series: FALLBACK_SERIES.map((c, i) => cssVar(`--chart-series-${i + 1}`, c)),
    }),
    [],
  )
}

function formatTick(v, xType) {
  if (v == null) return ''
  if (xType === 'time') return String(v).slice(0, 10)
  if (typeof v === 'number') return formatNumber(v)
  return String(v)
}

function ChartRenderer({ spec, rows, compact = false, height }) {
  const colors = useChartColors()
  const h = height ?? (compact ? 180 : 420)
  const margin = compact ? { top: 8, right: 12, bottom: 4, left: 0 } : { top: 16, right: 24, bottom: 8, left: 8 }
  const tickStyle = { fill: colors.text, fontSize: compact ? 10 : 12 }
  const xKey = spec.type === 'histogram' ? 'x' : spec.x

  const common = (
    <>
      <CartesianGrid stroke={colors.grid} vertical={false} />
      <XAxis
        dataKey={xKey}
        tick={tickStyle}
        tickLine={false}
        axisLine={{ stroke: colors.axis }}
        tickFormatter={(v) => formatTick(v, spec.type === 'histogram' ? 'category' : spec.xType)}
        minTickGap={compact ? 24 : 16}
        interval="preserveStartEnd"
        type={spec.type === 'scatter' ? 'number' : 'category'}
        name={spec.x}
        domain={spec.type === 'scatter' ? ['auto', 'auto'] : undefined}
      />
      <YAxis
        tick={tickStyle}
        tickLine={false}
        axisLine={false}
        width={compact ? 40 : 60}
        tickFormatter={(v) => formatNumber(v)}
        label={
          !compact && spec.yLabel
            ? { value: spec.unit ? `${spec.yLabel} (${spec.unit})` : spec.yLabel, angle: -90, position: 'insideLeft', fill: colors.text, fontSize: 12 }
            : undefined
        }
        type="number"
        domain={['auto', 'auto']}
      />
      <Tooltip
        contentStyle={{ background: colors.tooltipBg, border: `1px solid ${colors.axis}`, fontSize: 12, color: '#e8e6df' }}
        labelStyle={{ color: colors.text }}
        formatter={(v) => [formatNumber(v, { maxFractionDigits: 4 }), undefined]}
        labelFormatter={(v) => formatTick(v, spec.xType)}
        cursor={{ stroke: colors.axis }}
      />
      {!compact && spec.series.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: colors.text }} />}
      {(spec.referenceLines ?? []).map((r) => (
        <ReferenceLine key={`${r.y}-${r.label}`} y={r.y} stroke={colors.text} strokeDasharray="4 4" label={!compact && r.label ? { value: r.label, fill: colors.text, fontSize: 11 } : undefined} />
      ))}
    </>
  )

  const seriesColor = (s, i) => s.color || colors.series[i % colors.series.length]

  let chart
  if (spec.type === 'bar' || spec.type === 'histogram') {
    chart = (
      <BarChart data={rows} margin={margin} barCategoryGap={2}>
        {common}
        {spec.series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={seriesColor(s, i)} stackId={spec.stacked ? 'a' : undefined} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        ))}
      </BarChart>
    )
  } else if (spec.type === 'area') {
    chart = (
      <AreaChart data={rows} margin={margin}>
        {common}
        {spec.series.map((s, i) => (
          <Area
            key={s.key}
            dataKey={s.key}
            name={s.label}
            stroke={seriesColor(s, i)}
            fill={seriesColor(s, i)}
            fillOpacity={0.25}
            strokeWidth={2}
            dot={false}
            stackId={spec.stacked ? 'a' : undefined}
            connectNulls
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    )
  } else if (spec.type === 'scatter') {
    chart = (
      <ScatterChart margin={margin}>
        {common}
        {spec.series.map((s, i) => (
          <Scatter key={s.key} data={rows} dataKey={s.key} name={s.label} fill={seriesColor(s, i)} isAnimationActive={false} />
        ))}
      </ScatterChart>
    )
  } else {
    chart = (
      <LineChart data={rows} margin={margin}>
        {common}
        {spec.series.map((s, i) => (
          <Line
            key={s.key}
            dataKey={s.key}
            name={s.label}
            stroke={seriesColor(s, i)}
            strokeWidth={2}
            dot={rows.length <= 40 ? { r: 3 } : false}
            activeDot={{ r: 5 }}
            connectNulls
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    )
  }

  return (
    <div className="chart-renderer" style={{ height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        {chart}
      </ResponsiveContainer>
    </div>
  )
}

export default ChartRenderer
