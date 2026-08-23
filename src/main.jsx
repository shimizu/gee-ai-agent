// エントリポイント。React 19 の createRoot でアプリをマウントする。
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

if (import.meta.env.DEV) {
  // 開発時のみ: DevTools から window.__geeSpike() で raw タイル配信を検証できる。
  import('./gee/spike.js').then((m) => m.installSpike())
}

createRoot(document.getElementById('root')).render(<App />)
