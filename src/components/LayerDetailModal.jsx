// レイヤー詳細モーダル。
//
// 役割: レイヤー ID・種別・バンド・EE コード・可視化パラメータ・来歴プロンプトを表示する。
function LayerDetailModal({ layer, onClose }) {
  const isRaster = layer.kind === 'ee-raster'
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h3>{layer.name}</h3>
        <dl className="detail-fields">
          <dt>ID</dt>
          <dd>
            <code>{layer.layerId}</code>
          </dd>
          <dt>種別</dt>
          <dd>{isRaster ? `Earth Engine ラスター（${layer.spec?.mode}）` : `ベクター（${layer.geomType ?? '—'}・${layer.featureCount ?? 0} 地物）`}</dd>
          {isRaster && (
            <>
              <dt>バンド</dt>
              <dd>{(layer.bandNames ?? []).join(', ') || '—'}</dd>
              <dt>{layer.spec?.mode === 'raw' ? 'raw 設定' : 'vis'}</dt>
              <dd>
                <code>
                  {layer.spec?.mode === 'raw'
                    ? JSON.stringify({ bands: layer.runtime?.bandIds, rescale: layer.spec.rescale, colormap: layer.spec.colormap, reversed: layer.spec.colormapReversed, bandMath: layer.spec.bandMath })
                    : JSON.stringify(layer.spec?.vis ?? {})}
                </code>
              </dd>
              <dt>状態</dt>
              <dd>
                {layer.runtime?.status ?? '—'}
                {layer.runtime?.error ? ` — ${layer.runtime.error}` : ''}
              </dd>
            </>
          )}
          {layer.datasetId && (
            <>
              <dt>データセット</dt>
              <dd>
                <code>{layer.datasetId}</code>
              </dd>
            </>
          )}
          <dt>作成</dt>
          <dd>{layer.createdAt ? new Date(layer.createdAt).toLocaleString('ja-JP') : '—'}</dd>
        </dl>
        {layer.originPrompt && (
          <>
            <div className="detail-preview-label">元のプロンプト</div>
            <p className="detail-text">{layer.originPrompt}</p>
          </>
        )}
        {isRaster && (
          <>
            <div className="detail-preview-label">Earth Engine コード</div>
            <pre className="code-block">{layer.spec?.code}</pre>
          </>
        )}
        <div className="modal-actions">
          <button onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  )
}

export default LayerDetailModal
