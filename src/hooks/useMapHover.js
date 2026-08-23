// raw レイヤーのホバーで実ピクセル値を拾う結線フック。
//
// 役割: MapLibre の mousemove（lngLat・zoom）を受け、表示中の raw レイヤーごとにタイルキャッシュから
//       値を引いて HoverReadout 用の配列にする。rAF で間引く。
import { useCallback, useRef, useState } from 'react'
import { pickValue } from '../gee/pixel-pick.js'

export function useMapHover({ layers, tileCache }) {
  const [hoverItems, setHoverItems] = useState([])
  const pendingRef = useRef(null)
  const layersRef = useRef(layers)
  layersRef.current = layers

  const handleMouseMove = useCallback(
    ({ lng, lat, zoom }) => {
      pendingRef.current = { lng, lat, zoom }
      if (pendingRef.current.scheduled) return
      pendingRef.current.scheduled = true
      requestAnimationFrame(() => {
        const p = pendingRef.current
        if (!p) return
        p.scheduled = false
        const items = []
        for (const layer of layersRef.current) {
          if (layer.kind !== 'ee-raster' || layer.spec?.mode !== 'raw' || layer.visible === false) continue
          if (layer.runtime?.status !== 'ready') continue
          const cache = tileCache.getLayer(layer.layerId)
          const picked = pickValue(cache, p.lng, p.lat, { preferZoom: Math.floor(p.zoom), nodata: layer.spec?.nodata })
          if (!picked) continue
          items.push({
            layerId: layer.layerId,
            name: layer.name,
            bands: layer.runtime?.bandIds ?? [],
            values: picked.isNoData ? null : picked.values,
          })
        }
        setHoverItems((cur) => (cur.length === 0 && items.length === 0 ? cur : items))
      })
    },
    [tileCache],
  )

  const clearHover = useCallback(() => setHoverItems([]), [])

  return { hoverItems, handleMouseMove, clearHover }
}
