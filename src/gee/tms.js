// WebMercatorQuad の TileMatrixSet 記述子と座標変換（純関数部分はテスト対象）。
//
// 役割: EE のタイル索引（z/x/y, 256px, EPSG:3857）を deck.gl-raster の RasterTileLayer に
//       そのまま渡すための RasterTilesetDescriptor を作る。TileMatrixSetAdaptor に OGC 形式の
//       TMS JSON（手書き生成）と 3857⇔4326 の変換関数を与える。
// 関係: Layers/index.js がモジュール単一インスタンスとして使う（参照安定が必要）。
import { TileMatrixSetAdaptor } from '@developmentseed/deck.gl-raster'

export const MERCATOR_ORIGIN = 20037508.342789244
export const TOP_RESOLUTION = 156543.03392804097 // m/px at z=0 (256px)
const SCREEN_PIXEL_M = 0.00028
const MAX_LAT = 85.05112878
const R = 6378137

export function lngLatToMercator(lng, lat) {
  const clampedLat = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat))
  const x = (lng * Math.PI * R) / 180
  const y = R * Math.log(Math.tan(Math.PI / 4 + (clampedLat * Math.PI) / 360))
  return [x, y]
}

export function mercatorToLngLat(x, y) {
  const lng = (x / R) * (180 / Math.PI)
  const lat = (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI)
  return [lng, lat]
}

export function createWebMercatorQuadTms({ maxZoom = 24, tileSize = 256 } = {}) {
  const tileMatrices = Array.from({ length: maxZoom + 1 }, (_, z) => {
    const cellSize = TOP_RESOLUTION / 2 ** z
    return {
      id: String(z),
      scaleDenominator: cellSize / SCREEN_PIXEL_M,
      cellSize,
      cornerOfOrigin: 'topLeft',
      pointOfOrigin: [-MERCATOR_ORIGIN, MERCATOR_ORIGIN],
      tileWidth: tileSize,
      tileHeight: tileSize,
      matrixWidth: 2 ** z,
      matrixHeight: 2 ** z,
    }
  })
  return {
    id: 'WebMercatorQuad',
    title: 'Google Maps Compatible for the World',
    crs: 'http://www.opengis.net/def/crs/EPSG/0/3857',
    orderedAxes: ['X', 'Y'],
    boundingBox: {
      lowerLeft: [-MERCATOR_ORIGIN, -MERCATOR_ORIGIN],
      upperRight: [MERCATOR_ORIGIN, MERCATOR_ORIGIN],
      crs: 'http://www.opengis.net/def/crs/EPSG/0/3857',
    },
    tileMatrices,
  }
}

// z/x/y タイルの EPSG:3857 アフィン変換（computePixels の grid 用）。
export function tileAffineTransform({ x, y, z }, tileSize = 256) {
  const tileMeters = (2 * MERCATOR_ORIGIN) / 2 ** z
  const res = tileMeters / tileSize
  return {
    scaleX: res,
    shearX: 0,
    translateX: -MERCATOR_ORIGIN + x * tileMeters,
    shearY: 0,
    scaleY: -res,
    translateY: MERCATOR_ORIGIN - y * tileMeters,
  }
}

let descriptor = null
export function getWebMercatorDescriptor() {
  descriptor ??= new TileMatrixSetAdaptor(createWebMercatorQuadTms(), {
    projectTo3857: (x, y) => [x, y],
    projectFrom3857: (x, y) => [x, y],
    projectTo4326: mercatorToLngLat,
    projectFrom4326: lngLatToMercator,
  })
  return descriptor
}
