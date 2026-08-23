// ツールレジストリの組み立て。
//
// 役割: SOURCES の各ソースに deps（ストア・地図操作コールバック・GEE クライアント）を渡して
//       ToolRegistry へ登録する。重複名は ToolRegistry が例外にする。
// 関係: hooks/useAgentSession.js が useMemo で 1 回だけ作る。
//
// deps の形:
//   { geeClient, datasetStore, layerStore, chartStore,
//     addRasterLayer, addVectorLayer, removeLayer, updateLayer, updateLayerSpec,
//     getMapView, fitBounds, postChatMessage, session, log }
import { ToolRegistry } from '../agent/tool-registry.js'
import { SOURCES } from './sources.js'

export function createToolRegistry(deps, sources = SOURCES) {
  const registry = new ToolRegistry()
  for (const source of sources) source.register(registry, deps)
  return registry
}
