// コーヒー監視ソース（ツール + スキル）。
// 監視カレンダー・産地・リスクプロファイルは純データ（calendar.js / regions.js / risk-profiles.js）で持ち、スキルの表もそこから生成する。
import { COFFEE_LIST_MONITORS, COFFEE_SHOW_REGIONS } from './definitions.js'
import { makeCoffeeHandlers } from './handlers.js'
import { COFFEE_SKILL } from '../../agent/skills/coffee.js'

export const coffeeSource = {
  id: 'coffee',
  skills: [COFFEE_SKILL],
  register(registry, deps) {
    const h = makeCoffeeHandlers(deps)
    registry
      .register(COFFEE_LIST_MONITORS, (input) => h.listMonitors(input))
      .register(COFFEE_SHOW_REGIONS, (input) => h.showRegions(input))
  },
}
