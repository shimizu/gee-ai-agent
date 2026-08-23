// チャート/データセットソース。
import { ANALYZE_DATASET, INSPECT_DATASET, LIST_DATASETS, SHOW_CHART } from './definitions.js'
import { makeChartHandlers } from './handlers.js'
import { CHART_SKILL } from '../../agent/skills/chart.js'

export const chartSource = {
  id: 'chart',
  skills: [CHART_SKILL],
  register(registry, deps) {
    const h = makeChartHandlers(deps)
    registry
      .register(SHOW_CHART, (input) => h.showChart(input))
      .register(LIST_DATASETS, () => h.listDatasets())
      .register(INSPECT_DATASET, (input) => h.inspectDataset(input))
      .register(ANALYZE_DATASET, (input) => h.analyzeDataset(input))
  },
}
