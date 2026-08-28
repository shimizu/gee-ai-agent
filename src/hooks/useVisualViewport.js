// 実際に見えている領域（visualViewport）の高さと上端オフセットを追跡する。
//
// 役割: スマホブラウザでは 100vh / 100dvh の解釈がブラウザ・表示モード（URL バーの表示/非表示、
//       ホーム画面追加、キーボード表示）で揺れ、アプリ下端（送信ボタン）が画面外に出ることがある。
//       visualViewport API で「今見えている高さ」を測り、App が .app-shell の高さに直接適用する。
// 関係: App.jsx が呼び、返り値を .app-shell のインライン style に渡す。API が無い環境では null を返し、
//       CSS の 100dvh（フォールバック 100vh）に委ねる。
import { useEffect, useState } from 'react'

function readBox(vv) {
  // ピンチズーム中は height が縮むので scale を掛けてレイアウト px に戻す。
  return { height: Math.round(vv.height * vv.scale), top: Math.round(vv.offsetTop) }
}

export function useVisualViewport() {
  const [box, setBox] = useState(() => (globalThis.visualViewport ? readBox(globalThis.visualViewport) : null))

  useEffect(() => {
    const vv = globalThis.visualViewport
    if (!vv) return undefined
    const update = () => {
      const next = readBox(vv)
      setBox((prev) => (prev && prev.height === next.height && prev.top === next.top ? prev : next))
    }
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    window.addEventListener('orientationchange', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

  return box
}
