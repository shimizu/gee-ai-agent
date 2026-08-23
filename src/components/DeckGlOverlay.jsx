// MapLibre（react-map-gl）の上に deck.gl レイヤーを重ねる MapboxOverlay のラッパ。
//
// 役割: useControl で MapboxOverlay を生成し、props（layers / interleaved / onDeviceInitialized）を
//       毎レンダリングで setProps する。interleaved にすると MapLibre のラベルの下にラスターを敷ける。
// 流用元: reference/deck.gl-raster/examples/_shared/components/deckgl-overlay.tsx
import { MapboxOverlay } from '@deck.gl/mapbox'
import { useControl } from 'react-map-gl/maplibre'

function DeckGlOverlay(props) {
  const overlay = useControl(() => new MapboxOverlay(props))
  overlay.setProps(props)
  return null
}

export default DeckGlOverlay
