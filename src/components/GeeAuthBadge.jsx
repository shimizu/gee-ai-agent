// GEE 認証状態バッジ（ログイン/ログアウトボタン兼用）。
//
// 役割: GeeClient の状態（idle / loading-lib / authenticating / initializing / ready / expired / error）を
//       色付きバッジで示し、クリックでログイン（未設定なら設定を開く）/ ログアウトする。
// 関係: 状態と操作は useGeeClient が持ち、App 経由で渡る。
const LABELS = {
  idle: 'GEE ログイン',
  'loading-lib': 'GEE 読込中…',
  authenticating: 'GEE 認証中…',
  initializing: 'GEE 初期化中…',
  ready: 'GEE 接続中',
  expired: 'GEE 期限切れ・再ログイン',
  error: 'GEE エラー・再試行',
}

function GeeAuthBadge({ state, configured, onLogin, onLogout, onOpenSettings }) {
  const status = state?.status ?? 'idle'
  const busy = ['loading-lib', 'authenticating', 'initializing'].includes(status)
  const title = state?.error
    ? state.error
    : status === 'ready'
      ? `project: ${state.project}（クリックでログアウト）`
      : configured
        ? 'Google アカウントで Earth Engine にログイン'
        : '⚙ 設定で GEE の OAuth クライアント ID とプロジェクト ID を入力してください'

  const handleClick = () => {
    if (busy) return
    if (status === 'ready') {
      if (window.confirm('GEE からログアウトしますか？')) onLogout()
      return
    }
    if (!configured) {
      onOpenSettings()
      return
    }
    onLogin()
  }

  return (
    <button type="button" className={`gee-badge gee-${status}`} onClick={handleClick} title={title} disabled={busy}>
      ●<span className="badge-text"> {LABELS[status] ?? status}</span>
      {status === 'ready' && state.project && <span className="badge-project"> {state.project}</span>}
    </button>
  )
}

export default GeeAuthBadge
