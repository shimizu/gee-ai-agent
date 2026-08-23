// GEE ソース（ツール + スキル）。
import { EE_ADD_LAYER, EE_DESCRIBE, EE_RUN, EE_TIME_SERIES } from './definitions.js'
import { makeGeeHandlers } from './handlers.js'
import { GEE_CORE_SKILL } from '../../agent/skills/gee-core.js'
import { GEE_VIZ_SKILL } from '../../agent/skills/gee-viz.js'
import { GEE_DATASETS_SKILL } from '../../agent/skills/gee-datasets.js'

export const geeSource = {
  id: 'gee',
  skills: [GEE_CORE_SKILL, GEE_DATASETS_SKILL, GEE_VIZ_SKILL],
  register(registry, deps) {
    const h = makeGeeHandlers(deps)
    registry
      .register(EE_RUN, (input) => h.eeRun(input))
      .register(EE_ADD_LAYER, (input) => h.eeAddLayer(input))
      .register(EE_TIME_SERIES, (input) => h.eeTimeSeries(input))
      .register(EE_DESCRIBE, (input) => h.eeDescribe(input))
  },
}
