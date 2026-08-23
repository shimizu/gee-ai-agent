// Earth Engine JS クライアント（@google/earthengine）の遅延ロード。
//
// 役割: 約 8MB のライブラリを初期バンドルから外し、必要になった時点で一度だけ import する。
//       あわせて Google Identity Services（OAuth ポップアップ用）のスクリプトを先読みし、
//       ログインボタンのクリック時にポップアップブロッカーに引っかからないようにする
//       （EE 側は認証時に gsi/client を非同期ロードするため、先読みしないとクリックの
//       ジェスチャー文脈が切れる環境がある）。
// 関係: ee-client.js が loadEe() を呼ぶ。他のモジュールは ee インスタンスを引数で受け取る。
let eePromise = null
let gisPromise = null

const GIS_URL = 'https://accounts.google.com/gsi/client'

export function loadEe() {
  eePromise ??= import('@google/earthengine').then((m) => {
    const ee = m.default ?? m
    // Closure ビルドの EE は ee.initialize 内で goog.global.ee（= window.ee）を参照して
    // ee.Classifier 等の生成クラスを組み立てる。ES module として import すると window.ee が
    // 無く "Cannot use 'in' operator to search for 'Classifier' in undefined" になるため公開する。
    if (typeof window !== 'undefined' && !window.ee) window.ee = ee
    return ee
  })
  return eePromise
}

export function preloadGis() {
  if (typeof document === 'undefined') return Promise.resolve()
  gisPromise ??= new Promise((resolve) => {
    if (document.querySelector(`script[src="${GIS_URL}"]`)) {
      resolve()
      return
    }
    const s = document.createElement('script')
    s.src = GIS_URL
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => resolve() // 失敗しても EE 側が再ロードを試みる
    document.head.appendChild(s)
  })
  return gisPromise
}

// 設定保存時などに呼び、ライブラリと GIS をまとめて先読みする。
export function preloadAll() {
  return Promise.all([loadEe(), preloadGis()])
}
