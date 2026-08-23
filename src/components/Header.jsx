// ヘッダーバー。
//
// 役割: アプリ名、GEE 認証バッジ（ログイン/ログアウト）、About、右パネルの開閉トグル、
//       右端に設定スロット（ApiSettings）を表示する。
// 関係: geeSlot / settingsSlot は App が差し込む（スロット方式でロジックを持ち込まない）。
function Header({ rightOpen, onToggleRight, onShowAbout, geeSlot, settingsSlot }) {
  return (
    <header className="app-header">
      <div className="app-title">
        🛰️<span className="title-text"> gee-ai-agent</span>
      </div>

      <button type="button" className="panel-toggle" onClick={onShowAbout} title="このアプリについて">
        ⓘ<span className="btn-label"> About</span>
      </button>

      {geeSlot}

      <div className="header-spacer" />

      <button
        type="button"
        className={`panel-toggle${rightOpen ? ' active' : ''}`}
        aria-pressed={rightOpen}
        onClick={onToggleRight}
        title="パネルの表示/非表示"
      >
        <span className="btn-label">パネル </span>◨
      </button>

      {settingsSlot}
    </header>
  )
}

export default Header
