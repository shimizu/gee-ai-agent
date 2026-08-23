// 地図ソース（レイヤー操作ツール。スキルは gee-viz / chart 側に含める）。
import { ADD_VECTOR_LAYER, FIT_BOUNDS, GET_MAP_VIEW, LIST_LAYERS, REMOVE_LAYER, UPDATE_LAYER_STYLE } from './definitions.js'
import { makeMapHandlers } from './handlers.js'

export const mapSource = {
  id: 'map',
  skills: [],
  register(registry, deps) {
    const h = makeMapHandlers(deps)
    registry
      .register(LIST_LAYERS, () => h.listLayers())
      .register(REMOVE_LAYER, (input) => h.removeLayer(input))
      .register(UPDATE_LAYER_STYLE, (input) => h.updateLayerStyle(input))
      .register(GET_MAP_VIEW, () => h.getMapView())
      .register(FIT_BOUNDS, (input) => h.fitBounds(input))
      .register(ADD_VECTOR_LAYER, (input) => h.addVectorLayer(input))
  },
}
