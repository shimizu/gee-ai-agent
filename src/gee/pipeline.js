// raw レイヤーの GPU レンダリングパイプライン（deck.gl-raster の shader module 列）を組む。
//
// 役割: レイヤー spec（colormap / rescale / bandMath / nodata）から renderPipeline を作る。
//       spec だけを変えれば再フェッチ無しで再描画される（updateTriggers.renderTile）。
// 関係: Layers/index.js の renderTile から呼ばれる。band math は事前定義のみ（モデルに GLSL を
//       書かせない）。
import {
  Colormap,
  COLORMAP_INDEX,
  CreateTexture,
  FilterNoDataVal,
  LinearRescale,
} from '@developmentseed/deck.gl-raster/gpu-modules'

// バンド演算（事前定義）。入力は color.r/g/b/a に 1..4 バンド目が入っている前提。
export const BAND_MATH = {
  normalized_difference: {
    name: 'bandMathNormalizedDifference',
    inject: {
      'fs:DECKGL_FILTER_COLOR': `
        {
          float a = color.r; float b = color.g;
          float d = a + b;
          color.r = (abs(d) < 1e-9) ? 0.0 : (a - b) / d;
        }
      `,
    },
  },
  ratio: {
    name: 'bandMathRatio',
    inject: {
      'fs:DECKGL_FILTER_COLOR': `
        { float b = color.g; color.r = (abs(b) < 1e-9) ? 0.0 : color.r / b; }
      `,
    },
  },
  difference: {
    name: 'bandMathDifference',
    inject: { 'fs:DECKGL_FILTER_COLOR': `color.r = color.r - color.g;` },
  },
  log10: {
    name: 'bandMathLog10',
    inject: {
      'fs:DECKGL_FILTER_COLOR': `color.r = (color.r > 0.0) ? log(color.r) / log(10.0) : 0.0;`,
    },
  },
}

export const BAND_MATH_NAMES = Object.keys(BAND_MATH)

// 出力の alpha を 1 に固定する（rgba32float の alpha=0 や Colormap 出力の安定化）。
export const SetAlpha1 = {
  name: 'setAlpha1',
  inject: { 'fs:DECKGL_FILTER_COLOR': `color.a = 1.0;` },
}

export const COLORMAP_NAMES = Object.keys(COLORMAP_INDEX)
export const DEFAULT_COLORMAP = 'viridis'

export function resolveColormapIndex(name) {
  const key = String(name ?? DEFAULT_COLORMAP).toLowerCase()
  return COLORMAP_INDEX[key] ?? COLORMAP_INDEX[DEFAULT_COLORMAP]
}

// data: { texture, channels }。spec: { rescale:[min,max], colormap, colormapReversed, bandMath, nodata }。
export function buildRenderPipeline(data, spec, { colormapTexture }) {
  const modules = [{ module: CreateTexture, props: { textureName: data.texture } }]
  if (spec.nodata != null && Number.isFinite(spec.nodata)) {
    modules.push({ module: FilterNoDataVal, props: { value: spec.nodata } })
  }
  const bandMath = spec.bandMath ? BAND_MATH[spec.bandMath] : null
  if (bandMath) modules.push({ module: bandMath })

  const [rmin, rmax] = Array.isArray(spec.rescale) && spec.rescale.length === 2 ? spec.rescale : [0, 1]
  modules.push({ module: LinearRescale, props: { rescaleMin: Number(rmin), rescaleMax: Number(rmax) } })

  const singleChannel = data.channels === 1 || Boolean(bandMath)
  if (singleChannel && colormapTexture) {
    modules.push({
      module: Colormap,
      props: {
        colormapTexture,
        colormapIndex: resolveColormapIndex(spec.colormap),
        reversed: Boolean(spec.colormapReversed),
      },
    })
  }
  modules.push({ module: SetAlpha1 })
  return { renderPipeline: modules }
}
