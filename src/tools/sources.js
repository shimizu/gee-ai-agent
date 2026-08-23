// ツール/スキルの「ソース」一覧（拡張ポイント）。
//
// 役割: 各データソース（GEE / 地図 / チャート / PortWatch …）は
//         { id, skills: [Markdown 文字列...], register(registry, deps) }
//       を export し、ここに 1 行足すだけでツール登録とシステムプロンプトの両方へ反映される。
// 関係: register-tools.js（createToolRegistry）と agent/system-prompt.js（composeSystemPrompt）が参照。
import { geeSource } from './gee/index.js'
import { mapSource } from './map/index.js'
import { chartSource } from './chart/index.js'
import { portwatchSource } from './portwatch/index.js'

export const SOURCES = [geeSource, mapSource, chartSource, portwatchSource]
