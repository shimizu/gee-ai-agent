// イントロダクション（About）モーダル。
//
// 役割: 「何ができるアプリか」と必要な設定を簡潔に提示する。初回アクセス時に自動表示し、
//       ヘッダーの About からいつでも再表示できる。
function AboutModal({ onClose }) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal about-modal" onClick={(e) => e.stopPropagation()}>
        <h3>🛰️ gee-ai-agent</h3>
        <p className="about-lead">
          自然言語で指示すると、AI エージェントが Google Earth Engine で衛星データの分析を実行し、
          結果を地図レイヤーとチャートで示す、ブラウザ完結型の分析エージェントです。IMF PortWatch の
          港湾データも扱え、港の情報と衛星データを組み合わせた分析ができます。
        </p>
        <ul className="about-list">
          <li>🤖 日本語で指示 → エージェントが Earth Engine コードを書いて実行</li>
          <li>🗺️ 地図レイヤー: EE 可視化タイル（png）と、生データを GPU で着色する raw モード（ホバーで実値・即時カラーマップ変更）</li>
          <li>📈 時系列・集計をデータセットに保存し、チャット内にチャート表示（クリックで拡大）</li>
          <li>⚓ PortWatch: 港・要衝の検索、日次入港数・貿易量、波及リスク、災害イベント</li>
        </ul>
        <p className="about-start">
          必要な設定（ヘッダー右の ⚙）: Claude API キー、GEE の OAuth クライアント ID と Cloud プロジェクト ID。
          設定後、ヘッダーの「GEE ログイン」で Google アカウント認証を行ってください。PortWatch だけの質問は GEE 不要です。
        </p>
        <div className="modal-actions">
          <button className="primary" onClick={onClose}>
            はじめる
          </button>
        </div>
      </div>
    </div>
  )
}

export default AboutModal
