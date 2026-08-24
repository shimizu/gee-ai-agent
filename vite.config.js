import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 本番ビルドの index.html へ CSP の meta を注入する。
// - script-src: エージェントが書く EE コードを new Function で実行するため 'unsafe-eval' が必須。
//   Google Identity Services（OAuth）は @google/earthengine が accounts.google.com から動的ロードする。
// - connect-src: Claude API / Earth Engine REST・タイル / Google OAuth / PortWatch(ArcGIS) / CARTO ベースマップ。
//   EE の認証付きリクエストは content-earthengine.googleapis.com（Google API の content エンドポイント）へ
//   切り替わることがある。これを許可しないと XHR が status 0 になり
//   "Failed to contact Earth Engine servers" になる（dev は CSP 非適用なので本番でのみ再現する）。
// - generativelanguage.googleapis.com（https/wss）: Gemini Live（音声相談）。
// - img-src: EE の png タイルと CARTO のスプライト。
// 開発時(serve)は Vite/HMR がインライン script を注入するため適用しない。
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' https://accounts.google.com https://apis.google.com",
  "connect-src 'self' https://api.anthropic.com https://earthengine.googleapis.com https://content-earthengine.googleapis.com https://oauth2.googleapis.com https://accounts.google.com https://www.googleapis.com https://generativelanguage.googleapis.com wss://generativelanguage.googleapis.com https://services9.arcgis.com https://basemaps.cartocdn.com https://*.basemaps.cartocdn.com https://tiles.basemaps.cartocdn.com",
  "img-src 'self' data: blob: https://earthengine.googleapis.com https://content-earthengine.googleapis.com https://*.basemaps.cartocdn.com https://basemaps.cartocdn.com",
  "frame-src https://accounts.google.com",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ')

function cspPlugin() {
  return {
    name: 'inject-csp-meta',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '</title>',
        `</title>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      )
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), cspPlugin()],
  optimizeDeps: {
    // @google/earthengine は Closure コンパイル済み CJS。ESM へプリバンドルする。geotiff は内部で
    // 圧縮デコーダを動的 import するため、事前に最適化して dev 時の再最適化（504）を避ける。
    include: ['@google/earthengine', 'geotiff'],
  },
  build: {
    chunkSizeWarningLimit: 3000,
    // AudioWorklet のソースは必ず実ファイルとして出す。data: URL にインライン化されると
    // worklet のモジュール取得は script-src の対象なので CSP（data: 不許可）で
    // "Unable to load a worklet's module." になる。
    assetsInlineLimit: (filePath) => (filePath.endsWith('pcm-worklet.js') ? false : undefined),
    sourcemap: true,
    rollupOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'earthengine', test: /node_modules[\\/]@google[\\/]earthengine/, priority: 30 },
            { name: 'react', test: /node_modules[\\/]react/, priority: 20 },
            { name: 'deckgl', test: /node_modules[\\/](@deck\.gl|@luma\.gl|@developmentseed)/, priority: 10 },
            { name: 'maplibre', test: /node_modules[\\/]maplibre-gl/, priority: 10 },
            { name: 'recharts', test: /node_modules[\\/](recharts|d3-)/, priority: 5 },
          ],
        },
      },
    },
  },
})
