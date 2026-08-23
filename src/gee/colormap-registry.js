// カラーマップスプライト（colormaps.png）の読み込みと GPU テクスチャ化。
//
// 役割: 同梱スプライトを一度だけ decode し、Device ごとに Texture2DArray を作ってメモ化する。
// 関係: App が device 取得後に getColormapTexture(device) を呼び、Layers/index.js へ渡す。
import { createColormapTexture, decodeColormapSprite } from '@developmentseed/deck.gl-raster/gpu-modules'
import colormapsPngUrl from '@developmentseed/deck.gl-raster/gpu-modules/colormaps.png'

let imagePromise = null
const textures = new WeakMap()

export function loadColormapImage() {
  imagePromise ??= fetch(colormapsPngUrl)
    .then((r) => r.arrayBuffer())
    .then((bytes) => decodeColormapSprite(bytes))
  return imagePromise
}

export async function getColormapTexture(device) {
  if (!device) return null
  const cached = textures.get(device)
  if (cached) return cached
  const image = await loadColormapImage()
  const tex = createColormapTexture(device, image)
  textures.set(device, tex)
  return tex
}
