// チャット内のチャートカード（クリックで拡大）。
//
// 役割: 小さなチャートとタイトル・単位を表示する。クリック / Enter で onOpen(chartId)。
import ChartRenderer from './ChartRenderer'

function ChartCard({ chart, onOpen }) {
  if (!chart) {
    return <p className="chart-card-missing">（チャートが見つかりません）</p>
  }
  const { spec, rows } = chart
  const handleKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen?.(chart.chartId)
    }
  }
  return (
    <div className="chart-card" role="button" tabIndex={0} onClick={() => onOpen?.(chart.chartId)} onKeyDown={handleKey} title="クリックで拡大">
      <div className="chart-card-header">
        <span className="chart-card-title">{spec.title || 'チャート'}</span>
        <span className="chart-card-meta">
          {spec.unit ? `${spec.unit} · ` : ''}
          {rows.length} 点 · 拡大 ⤢
        </span>
      </div>
      <ChartRenderer spec={spec} rows={rows} compact />
      {spec.series.length > 1 && (
        <div className="chart-card-legend">
          {spec.series.map((s, i) => (
            <span key={s.key} className="legend-item">
              <span className="legend-dot" style={{ background: s.color || `var(--chart-series-${(i % 6) + 1})` }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default ChartCard
