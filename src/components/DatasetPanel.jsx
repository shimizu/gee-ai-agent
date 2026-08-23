// データセット一覧（レイヤータブ下部）。
//
// 役割: Dataset Store の要約（ID・タイトル・件数・期間）を表示し、CSV/JSON/GeoJSON 保存と削除ができるようにする。
import { datasetHasGeo } from '../data/export-formats.js'

function DatasetPanel({ datasets, onRemove, onExport }) {
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
                {d.available && (
                  <span className="dataset-export">
                    <button className="mini-btn" onClick={() => onExport(d.id, 'csv')} title="CSV で保存">
                      CSV
                    </button>
                    <button className="mini-btn" onClick={() => onExport(d.id, 'json')} title="JSON で保存">
                      JSON
                    </button>
                    {datasetHasGeo(d) && (
                      <button className="mini-btn" onClick={() => onExport(d.id, 'geojson')} title="GeoJSON で保存">
                        GeoJSON
                      </button>
                    )}
                  </span>
                )}
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
