// 地図ビュー（MapLibre ベースマップ + deck.gl オーバーレイ）。
//
// 役割: CARTO のベクタースタイルをベースマップに、Layers/index.js が組んだ deck.gl レイヤーを
//       interleaved で重ねる。地図の移動・ホバー・Device 初期化を親へ通知し、fitBounds と
//       getMapView を親が使えるよう ref を公開する。preserveDrawingBuffer は音声機能の地図スクショ
//       （utils/capture-map の toDataURL）に必要。
// 関係: App が layers/colormapTexture/ハンドラを渡す。カメラは MapLibre が所有する。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Map as MaplibreMap } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'

import DeckGlOverlay from './DeckGlOverlay'
import HoverReadout from './HoverReadout'
import { renderLayers } from '../Layers'

export const BASEMAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

const INITIAL_VIEW = { longitude: 139.7, latitude: 35.6, zoom: 5 }

function getTooltip({ object }) {
  if (!object) return null
  const props = object.properties ?? {}
  const entries = Object.entries(props)
    .filter(([, v]) => v != null && typeof v !== 'object')
    .slice(0, 10)
  if (entries.length === 0) return null
  return { text: entries.map(([k, v]) => `${k}: ${v}`).join('\n') }
}

function MapView({
  layers,
  colormapTexture,
  hoverItems,
  onMapReady,
  onDeviceInitialized,
  onMouseMove,
  onMouseLeave,
  onTileError,
  onTileUnload,
}) {
  const mapRef = useRef(null)
  const [beforeId, setBeforeId] = useState(undefined)

  // スタイル読込後、最初のシンボル（ラベル）レイヤー ID を取り、その下にラスターを敷く。
  const handleLoad = useCallback(() => {
    const map = mapRef.current?.getMap?.()
    if (!map) return
    try {
      const firstSymbol = map.getStyle()?.layers?.find((l) => l.type === 'symbol')
      setBeforeId(firstSymbol?.id)
    } catch {
      setBeforeId(undefined)
    }
    onMapReady?.(mapRef.current)
  }, [onMapReady])

  useEffect(() => () => onMapReady?.(null), [onMapReady])

  const deckLayers = useMemo(
    () => renderLayers(layers, { colormapTexture, beforeId, onTileError, onTileUnload }),
    [layers, colormapTexture, beforeId, onTileError, onTileUnload],
  )

  const handleMouseMove = useCallback(
    (e) => {
      if (!onMouseMove) return
      const zoom = mapRef.current?.getZoom?.() ?? 0
      onMouseMove({ lng: e.lngLat.lng, lat: e.lngLat.lat, zoom })
    },
    [onMouseMove],
  )

  return (
    <div className="map-view">
      <MaplibreMap
        ref={mapRef}
        initialViewState={INITIAL_VIEW}
        mapStyle={BASEMAP_STYLE}
        attributionControl={false}
        preserveDrawingBuffer
        onLoad={handleLoad}
        onMouseMove={handleMouseMove}
        onMouseOut={onMouseLeave}
        reuseMaps
      >
        <DeckGlOverlay layers={deckLayers} interleaved getTooltip={getTooltip} onDeviceInitialized={onDeviceInitialized} />
      </MaplibreMap>
      <HoverReadout items={hoverItems} />
      <div className="attribution">
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
          © OpenStreetMap
        </a>{' '}
        <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer">
          © CARTO
        </a>{' '}
        | Google Earth Engine
      </div>
    </div>
  )
}

export default MapView
