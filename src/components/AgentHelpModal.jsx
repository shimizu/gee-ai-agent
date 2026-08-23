// エージェントの使い方（サンプルプロンプト）モーダル。
//
// 役割: スキルに対応したサンプルプロンプトを提示し、クリックで入力欄へ挿入する。
const SAMPLE_GROUPS = [
  {
    title: '衛星画像を地図に',
    prompts: [
      '東京湾周辺の 2024 年夏の Sentinel-2 真色画像を表示して',
      '今表示している範囲の最新の Landsat 9 真色合成を出して',
      'この範囲の ESA WorldCover 土地被覆を表示して',
    ],
  },
  {
    title: '指標（raw モード）',
    prompts: [
      '今の表示範囲で 2024 年 5〜9 月の NDVI 中央値を raw モードで表示して',
      'この範囲の標高を terrain カラーマップで出して',
      '2023 年と 2019 年の VIIRS 夜間光の差分を表示して',
    ],
  },
  {
    title: '集計・時系列・チャート',
    prompts: [
      'この範囲の平均標高と最大標高を教えて',
      'この地点（地図中心）の 2023 年 MODIS NDVI 月別推移をグラフにして',
      '東京周辺の 2024 年 6〜7 月の日降水量の推移をグラフにして（気象データで）',
    ],
  },
  {
    title: 'PortWatch（港湾）',
    prompts: [
      'シンガポール港の過去 1 年の入港数推移をグラフにして、直近の傾向を分析して',
      'スエズ運河の通航数は最近異常？',
      '横浜港が混乱したらどの国の貿易が影響を受ける？',
    ],
  },
  {
    title: '港 × 衛星',
    prompts: [
      'シンガポール港周辺 10km の夜間光の月次推移と入港数を比べて',
      '上海港の周辺で 2018 年から 2024 年で市街地（Dynamic World built）がどう広がったか地図に',
    ],
  },
]

function AgentHelpModal({ onClose, onPick }) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal modal-wide help-modal" onClick={(e) => e.stopPropagation()}>
        <h3>使い方 — サンプルプロンプト</h3>
        <p className="help-lead">
          クリックすると入力欄に挿入されます（地名・期間は自由に書き換えてください）。GEE のレイヤーには
          ヘッダーの「GEE ログイン」が必要です。
        </p>
        <div className="help-groups">
          {SAMPLE_GROUPS.map((group) => (
            <section className="help-group" key={group.title}>
              <h4>{group.title}</h4>
              <ul className="help-prompt-list">
                {group.prompts.map((prompt) => (
                  <li key={prompt}>
                    <button type="button" className="help-prompt" onClick={() => onPick(prompt)}>
                      {prompt}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="modal-actions">
          <button onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  )
}

export default AgentHelpModal
