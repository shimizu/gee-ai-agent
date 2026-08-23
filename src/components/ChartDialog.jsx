// チャート拡大ダイアログ（<dialog> showModal）。
//
// 役割: カードと同じ spec/rows を大きく描き、凡例・注記・出典・CSV ダウンロードを付ける。
import { useEffect, useRef } from 'react'
import ChartRenderer from './ChartRenderer'
import { downloadBlob, rowsToCsv } from '../utils/download.js'

function ChartDialog({ chart, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (chart && !el.open) {
      try {
        el.showModal()
      } catch {
        // 既に open の場合など
      }
    }
    if (!chart && el.open) el.close()
  }, [chart])

  if (!chart) return <dialog ref={ref} className="chart-dialog" onClose={onClose} />

  const { spec, rows } = chart
  const columns = spec.type === 'histogram' ? ['x0', 'x1', 'count'] : [spec.x, ...spec.series.map((s) => s.key)]

  const handleCsv = () => {
    const csv = rowsToCsv(rows, columns)
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${(spec.title || chart.chartId).replace(/[\\/:*?"<>|]/g, '_')}.csv`)
  }

  return (
    <dialog ref={ref} className="chart-dialog" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="chart-dialog-body">
        <div className="chart-dialog-header">
          <div>
            <h3>{spec.title || 'チャート'}</h3>
            <div className="chart-dialog-meta">
              {spec.type} · {rows.length} 点{spec.unit ? ` · 単位: ${spec.unit}` : ''}
              {chart.datasetId ? ` · ${chart.datasetId}` : ''}
            </div>
          </div>
          <div className="chart-dialog-actions">
            <button type="button" className="ghost-button" onClick={handleCsv}>
              CSV
            </button>
            <button type="button" className="ghost-button" onClick={onClose}>
              閉じる
            </button>
          </div>
        </div>
        <ChartRenderer spec={spec} rows={rows} />
        {(spec.note || spec.source) && (
          <p className="chart-dialog-note">
            {spec.note}
            {spec.note && spec.source ? ' ' : ''}
            {spec.source ? `出典: ${spec.source}` : ''}
          </p>
        )}
      </div>
    </dialog>
  )
}

export default ChartDialog
