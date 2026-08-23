// データセット一覧（レイヤータブ下部）。
//
// 役割: Dataset Store の要約（ID・タイトル・件数・期間）を表示し、削除できるようにする。
function DatasetPanel({ datasets, onRemove }) {
  return (
    <div className="dataset-panel">
      <h3>データセット（{datasets.length}）</h3>
      {datasets.length === 0 ? (
        <p className="empty-state">時系列や集計結果がここに保存されます。</p>
      ) : (
        <ul className="dataset-list">
          {datasets.map((d) => (
            <li key={d.id} className="dataset-row">
              <div className="dataset-main">
                <code>{d.id}</code> <span className="dataset-title">{d.title}</span>
                <button className="icon-btn danger" onClick={() => onRemove(d.id)} title="削除">
                  ×
                </button>
              </div>
              <div className="dataset-meta">
                {d.recordCount} 行 · {(d.columns ?? []).slice(0, 6).join(', ')}
                {(d.columns ?? []).length > 6 ? '…' : ''}
                {d.dateRange ? ` · ${d.dateRange.from}〜${d.dateRange.to}` : ''}
                {!d.available ? ' · （行データ未読込）' : ''}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default DatasetPanel
