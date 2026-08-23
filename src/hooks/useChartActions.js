// チャートストアの結線フック。
//
// 役割: ChartStore の単一インスタンスを所有し、一覧と拡大ダイアログの開閉状態を持つ。
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'
import { ChartStore } from '../data/chart-store.js'

const chartStore = new ChartStore()

export function useChartActions() {
  const charts = useSyncExternalStore(chartStore.subscribe, chartStore.getSnapshot)
  const [openChartId, setOpenChartId] = useState(null)

  const chartsById = useMemo(() => new Map(charts.map((c) => [c.chartId, c])), [charts])
  const openChart = useCallback((chartId) => setOpenChartId(chartId), [])
  const closeChart = useCallback(() => setOpenChartId(null), [])
  const clearCharts = useCallback(() => {
    chartStore.clear()
    setOpenChartId(null)
  }, [])

  return { chartStore, charts, chartsById, openChartId, openChart, closeChart, clearCharts }
}
