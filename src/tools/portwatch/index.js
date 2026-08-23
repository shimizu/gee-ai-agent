// PortWatch ソース（ツール + スキル）。
import { PW_FETCH_METRICS, PW_FETCH_SPILLOVERS, PW_FIND_DISRUPTIONS, PW_SEARCH, PW_SHOW_LOCATIONS } from './definitions.js'
import { makePortwatchHandlers } from './handlers.js'
import { PORTWATCH_SKILL } from '../../agent/skills/portwatch.js'
import { PORTWATCH_X_GEE_SKILL } from '../../agent/skills/portwatch-x-gee.js'

export const portwatchSource = {
  id: 'portwatch',
  skills: [PORTWATCH_SKILL, PORTWATCH_X_GEE_SKILL],
  register(registry, deps) {
    const h = makePortwatchHandlers(deps)
    registry
      .register(PW_SEARCH, (input, ctx) => h.search(input, ctx))
      .register(PW_FETCH_METRICS, (input, ctx) => h.fetchMetricsTool(input, ctx))
      .register(PW_FETCH_SPILLOVERS, (input, ctx) => h.spillovers(input, ctx))
      .register(PW_FIND_DISRUPTIONS, (input, ctx) => h.disruptions(input, ctx))
      .register(PW_SHOW_LOCATIONS, (input, ctx) => h.showLocations(input, ctx))
  },
}
