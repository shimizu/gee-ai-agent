// レイヤー一覧パネル。
//
// 役割: レイヤーの表示/非表示・不透明度・ズーム・削除・再作成と、raw レイヤーのカラーマップ/レンジ変更。
//       行の ⓘ で詳細モーダル（EE コード・vis・来歴）を開く。
// 関係: layers は layer-store の配列。各操作は App 経由で useLayerActions に伝わる。
import { useState } from 'react'
import LayerDetailModal from './LayerDetailModal'
import { COLORMAP_NAMES } from '../gee/pipeline.js'

const STATUS_LABEL = {
  loading: '作成中…',
  restoring: '復元待ち（GEE ログイン後に再作成）',
  error: 'エラー',
  stale: '期限切れ（再作成）',
  ready: '',
}

function LayerRow({ layer, onToggle, onZoom, onRemove, onRebuild, onOpacity, onSpecChange, onShowDetail }) {
  const isRaster = layer.kind === 'ee-raster'
  const isRaw = isRaster && layer.spec?.mode === 'raw'
  const status = layer.runtime?.status ?? 'ready'
  const color = layer.style?.color ?? [120, 120, 120]
  const rescale = layer.spec?.rescale ?? [0, 1]

  return (
    <li className={`layer-row status-${status}`}>
      <div className="layer-row-main">
        <input type="checkbox" checked={layer.visible !== false} onChange={() => onToggle(layer.layerId)} title="表示/非表示" />
        {isRaster ? (
          <span className={`swatch swatch-${layer.spec?.mode}`} title={layer.spec?.mode} />
        ) : (
          <span className="swatch" style={{ background: `rgb(${color.join(',')})` }} />
        )}
        <span className="layer-name" title={layer.name}>
          {layer.name}
          <small> {isRaster ? `(${layer.spec?.mode}${layer.bandNames?.length ? `・${layer.bandNames.slice(0, 3).join(',')}${layer.bandNames.length > 3 ? '…' : ''}` : ''})` : `(${layer.geomType ?? '—'}・${layer.featureCount ?? 0})`}</small>
        </span>
        <button className="icon-btn" onClick={() => onShowDetail(layer)} title="レイヤー詳細">
          ⓘ
        </button>
        {layer.bounds && (
          <button className="icon-btn" onClick={() => onZoom(layer.layerId)} title="この範囲にズーム">
            ⌖
          </button>
        )}
        {isRaster && status !== 'loading' && (
          <button className="icon-btn" onClick={() => onRebuild(layer.layerId)} title="再作成（GEE で再計算）">
            ↻
          </button>
        )}
        <button className="icon-btn danger" onClick={() => onRemove(layer.layerId)} title="削除">
          ×
        </button>
      </div>
      {status !== 'ready' && (
        <div className={`layer-status ${status}`} title={layer.runtime?.error ?? ''}>
          {STATUS_LABEL[status] ?? status}
          {layer.runtime?.error ? `: ${String(layer.runtime.error).slice(0, 120)}` : ''}
        </div>
      )}
      <div className="layer-controls">
        <label title="不透明度">
          <span>透明度</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={layer.opacity ?? 1}
            onChange={(e) => onOpacity(layer.layerId, Number(e.target.value))}
          />
        </label>
        {isRaw && (
          <>
            <label title="カラーマップ">
              <span>色</span>
              <select value={layer.spec.colormap ?? 'viridis'} onChange={(e) => onSpecChange(layer.layerId, { colormap: e.target.value })}>
                {COLORMAP_NAMES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <input
                type="checkbox"
                checked={Boolean(layer.spec.colormapReversed)}
                onChange={(e) => onSpecChange(layer.layerId, { colormapReversed: e.target.checked })}
                title="反転"
              />
              <span className="ctl-hint">反転</span>
            </label>
            <label title="表示レンジ">
              <span>範囲</span>
              <input
                className="range-input"
                type="number"
                step="any"
                value={rescale[0]}
                onChange={(e) => onSpecChange(layer.layerId, { rescale: [Number(e.target.value), rescale[1]] })}
              />
              <span>〜</span>
              <input
                className="range-input"
                type="number"
                step="any"
                value={rescale[1]}
                onChange={(e) => onSpecChange(layer.layerId, { rescale: [rescale[0], Number(e.target.value)] })}
              />
            </label>
          </>
        )}
      </div>
    </li>
  )
}

function LayerPanel({ layers, onToggle, onZoom, onRemove, onRebuild, onOpacity, onSpecChange }) {
  const [detailLayerId, setDetailLayerId] = useState(null)
  const detailLayer = layers.find((l) => l.layerId === detailLayerId) ?? null

  return (
    <div className="layer-panel">
      <div className="layer-panel-header">
        <h3>レイヤー（{layers.length}）</h3>
      </div>
      {layers.length === 0 ? (
        <p className="empty-state">チャットで「〜を地図に表示して」と指示すると、ここにレイヤーが追加されます。</p>
      ) : (
        <ul className="layer-list">
          {[...layers].reverse().map((l) => (
            <LayerRow
              key={l.layerId}
              layer={l}
              onToggle={onToggle}
              onZoom={onZoom}
              onRemove={onRemove}
              onRebuild={onRebuild}
              onOpacity={onOpacity}
              onSpecChange={onSpecChange}
              onShowDetail={(layer) => setDetailLayerId(layer.layerId)}
            />
          ))}
        </ul>
      )}
      {detailLayer && <LayerDetailModal key={detailLayer.layerId} layer={detailLayer} onClose={() => setDetailLayerId(null)} />}
    </div>
  )
}

export default LayerPanel
