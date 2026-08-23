// チャート・データセットツールの実装。
import { validateChartSpec } from '../../data/chart-spec.js'
import { runMetricAnalysis } from '../portwatch/metrics.js'
import { summarizeDataset } from '../shared/summarize.js'

export function makeChartHandlers(deps) {
  const { datasetStore, chartStore, log } = deps

  function showChart(input) {
    let rows = null
    let datasetId = null
    if (input.dataset_id) {
      const ds = datasetStore.get(input.dataset_id)
      rows = ds.records
      datasetId = ds.id
    } else if (Array.isArray(input.data)) {
      rows = input.data
    }
    if (!rows) throw new Error('dataset_id か data を指定してください。')
    const { spec, rows: chartRows, warnings } = validateChartSpec(input, rows)
    const chart = chartStore.add({ spec, rows: chartRows, datasetId })
    deps.postChatMessage?.({ kind: 'chart', chartId: chart.chartId })
    log?.(`チャート表示: ${chart.chartId} ${spec.title || ''}`)
    const xs = chartRows.map((r) => r[spec.x]).filter((v) => v != null)
    return {
      chartId: chart.chartId,
      title: spec.title,
      type: spec.type,
      rowCount: chartRows.length,
      xRange: xs.length ? [xs[0], xs[xs.length - 1]] : null,
      series: spec.series.map((s) => s.key),
      warnings: warnings.length ? warnings : undefined,
    }
  }

  function listDatasets() {
    return { count: datasetStore.list().length, datasets: datasetStore.list() }
  }

  function inspectDataset(input) {
    return datasetStore.inspect(input.dataset_id, {
      sampleSize: input.sample_size ?? 5,
      distinctColumn: input.distinct_column,
    })
  }

  function analyzeDataset(input) {
    const ds = datasetStore.get(input.dataset_id)
    const result = runMetricAnalysis({
      records: ds.records,
      operation: input.operation,
      metric: input.column,
      dateColumn: input.date_column ?? ds.dateRange?.column ?? 'date',
    })
    return { datasetId: ds.id, title: ds.title, ...result }
  }

  return { showChart, listDatasets, inspectDataset, analyzeDataset, summarizeDataset }
}
