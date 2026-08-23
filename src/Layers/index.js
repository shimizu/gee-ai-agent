// deck.gl レイヤー配列を組み立てる唯一の場所。
//
// 役割: LayerStore のレイヤー（EE ラスター png/raw、ベクター）を deck.gl レイヤーに変換する。
//       png は TileLayer + BitmapLayer、raw は deck.gl-raster の RasterTileLayer（GPU パイプライン）、
//       ベクターは GeoJsonLayer。MapLibre の interleaved モードでラベルの下に敷くため beforeId を渡す。
// 関係: MapView が renderLayers() の結果を DeckGlOverlay に渡す。パイプラインは gee/pipeline.js。
import { BitmapLayer, GeoJsonLayer, TileLayer } from 'deck.gl'
import { RasterTileLayer } from '@developmentseed/deck.gl-raster'
import { buildRenderPipeline } from '../gee/pipeline.js'
import { getWebMercatorDescriptor } from '../gee/tms.js'

export function renderLayers(layers, { colormapTexture, beforeId, onTileError, onTileUnload } = {}) {
  const out = []
  // 配列の先頭が下。ラスターを先に、ベクターを上に描く。
  const rasters = layers.filter((l) => l.kind === 'ee-raster' && l.visible !== false)
  const vectors = layers.filter((l) => l.kind === 'vector' && l.visible !== false)

  for (const l of rasters) {
    if (l.runtime?.status !== 'ready') continue
    const common = { opacity: l.opacity ?? 1, beforeId }
    if (l.spec.mode === 'png') {
      out.push(
        new TileLayer({
          id: `png-${l.layerId}`,
          data: l.runtime.urlFormat,
          minZoom: 0,
          maxZoom: 22,
          tileSize: 256,
          maxRequests: 12,
          onTileError: (e) => onTileError?.(l.layerId, e),
          renderSubLayers: (props) => {
            const { west, south, east, north } = props.tile.bbox
            return new BitmapLayer(props, { data: null, image: props.data, bounds: [west, south, east, north] })
          },
          ...common,
        }),
      )
      continue
    }
    if (!colormapTexture && (l.runtime.bandIds?.length === 1 || l.spec.bandMath)) continue
    out.push(
      new RasterTileLayer({
        id: `raw-${l.layerId}`,
        tilesetDescriptor: getWebMercatorDescriptor(),
        getTileData: l.runtime.getTileData,
        renderTile: (data) => (data?.texture ? buildRenderPipeline(data, l.spec, { colormapTexture }) : null),
        updateTriggers: {
          renderTile: [l.spec.colormap, l.spec.colormapReversed, l.spec.rescale, l.spec.bandMath, l.spec.nodata, colormapTexture],
        },
        onTileUnload: (tile) => {
          try {
            tile?.content?.texture?.destroy?.()
          } catch {
            // 無視
          }
          onTileUnload?.(l.layerId, tile?.index)
        },
        onTileError: (e) => onTileError?.(l.layerId, e),
        minZoom: 0,
        maxZoom: 22,
        maxRequests: 8,
        ...common,
      }),
    )
  }

  for (const l of vectors) {
    if (!l.geojson) continue
    const color = l.style?.color ?? [255, 140, 0]
    out.push(
      new GeoJsonLayer({
        id: `vec-${l.layerId}`,
        data: l.geojson,
        pickable: true,
        pointType: 'circle',
        filled: true,
        stroked: true,
        getFillColor: [...color, 170],
        getLineColor: [...color, 255],
        getPointRadius: l.style?.radius ?? 6,
        pointRadiusUnits: 'pixels',
        pointRadiusMinPixels: 2,
        lineWidthMinPixels: l.style?.lineWidth ?? 2,
        opacity: l.opacity ?? 1,
        updateTriggers: { getFillColor: [color], getLineColor: [color], getPointRadius: [l.style?.radius] },
      }),
    )
  }
  return out
}
