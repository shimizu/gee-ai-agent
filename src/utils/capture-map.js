// 地図のスクリーンショット取得（ブラウザ専用の薄いユーティリティ）。
//
// 役割: MapLibre の canvas（interleaved モードでは deck.gl のレイヤーも同じ canvas に描かれる）から
//       JPEG の base64 を取り出す。toDataURL で読み出すため <Map> に preserveDrawingBuffer が必要。
// 関係: useVoiceSession が capture_map ツールの実装として呼び、Gemini Live へ画像として送る。
// 流用元: reference/web-gis-ai-agent/src/utils/capture-map.js（deck.gl canvas → MapLibre canvas）
export const MAP_CANVAS_SELECTOR = '.map-view .maplibregl-canvas'

const DEFAULT_MAX_WIDTH = 1024
const DEFAULT_SETTLE_MS = 600

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function captureMapImage({
  selector = MAP_CANVAS_SELECTOR,
  maxWidth = DEFAULT_MAX_WIDTH,
  quality = 0.75,
  settleMs = DEFAULT_SETTLE_MS,
} = {}) {
  const canvas = document.querySelector(selector)
  if (!canvas) throw new Error('地図キャンバスが見つかりませんでした。')
  if (settleMs > 0) await delay(settleMs)
  const width = canvas.width
  const height = canvas.height
  if (!width || !height) throw new Error('地図がまだ描画されていません。')

  let dataUrl
  if (width > maxWidth) {
    const scale = maxWidth / width
    const scaled = document.createElement('canvas')
    scaled.width = Math.round(width * scale)
    scaled.height = Math.round(height * scale)
    const ctx = scaled.getContext('2d')
    ctx.fillStyle = '#141416'
    ctx.fillRect(0, 0, scaled.width, scaled.height)
    ctx.drawImage(canvas, 0, 0, scaled.width, scaled.height)
    dataUrl = scaled.toDataURL('image/jpeg', quality)
  } else {
    dataUrl = canvas.toDataURL('image/jpeg', quality)
  }
  const base64 = dataUrl.split(',')[1]
  if (!base64) throw new Error('地図画像の取得に失敗しました。')
  return { base64, mimeType: 'image/jpeg', width, height }
}
