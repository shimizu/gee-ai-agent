// レイヤーのエクスポートモーダル（EE ラスター用）。
//
// 役割: 「EE からダウンロード」（getDownloadURL: 範囲・scale・CRS・バンド・形式、推定サイズと上限警告）と
//       「表示タイルから」（raw のみ: ズームを選んでクライアントで GeoTIFF 化）の 2 タブ。
// 関係: 実処理は App 経由で useLayerActions の exportLayerViaEE / exportLayerTiles。ここは入力と結果表示のみ。
import { useMemo, useState } from 'react'
import { DOWNLOAD_LIMIT_BYTES, estimateDownloadBytes } from '../gee/export-service.js'
import { MAX_TILES, tileRangeForBounds } from '../gee/tile-mosaic.js'
import { downloadBlob } from '../utils/download.js'
import { safeFilename } from '../data/export-formats.js'
import { roundBounds } from '../utils/format.js'

function openUrl(url) {
  const a = document.createElement('a')
  a.href = url
  a.target = '_blank'
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

function ExportLayerModal({ layer, getMapView, onExportViaEE, onExportTiles, onClose }) {
  const isRaw = layer.spec?.mode === 'raw'
  const view = useMemo(() => getMapView?.() ?? null, [getMapView])
  const [tab, setTab] = useState('ee')
  const [boundsText, setBoundsText] = useState(() => (view?.bounds ? roundBounds(view.bounds, 4).join(', ') : ''))
  const [scale, setScale] = useState(100)
  const [crs, setCrs] = useState('EPSG:4326')
  const [format, setFormat] = useState('geotiff')
  const [bands, setBands] = useState(() => layer.bandNames ?? [])
  const [zoom, setZoom] = useState(() => Math.min(18, Math.max(0, Math.floor((view?.zoom ?? 8) + 1))))
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  // 入力が変わったら古い結果/エラーを消す（イベント側で行い、effect での setState は避ける）。
  const touch = (setter) => (value) => {
    setter(value)
    setResult(null)
    setError('')
  }
  const changeTab = touch(setTab)
  const changeBounds = touch(setBoundsText)
  const changeScale = touch(setScale)
  const changeCrs = touch(setCrs)
  const changeFormat = touch(setFormat)
  const changeZoom = touch(setZoom)

  const bounds = useMemo(() => {
    const nums = boundsText.split(/[,\s]+/).filter(Boolean).map(Number)
    return nums.length === 4 && nums.every(Number.isFinite) ? nums : null
  }, [boundsText])

  const estimate = useMemo(() => {
    if (!bounds || !(Number(scale) > 0)) return null
    try {
      return estimateDownloadBytes({ bounds, scale: Number(scale), crs, bandCount: Math.max(1, bands.length || layer.bandNames?.length || 1), bytesPerSample: format === 'png' ? 1 : 4 })
    } catch {
      return null
    }
  }, [bounds, scale, crs, bands, format, layer.bandNames])

  const tileRange = useMemo(() => (bounds ? tileRangeForBounds(bounds, zoom) : null), [bounds, zoom])
  const tileBytes = tileRange ? tileRange.count * 256 * 256 * 4 * Math.max(1, layer.runtime?.bandIds?.length ?? 1) : 0

  const toggleBand = (b) => {
    setBands((cur) => (cur.includes(b) ? cur.filter((x) => x !== b) : [...cur, b]))
    setResult(null)
    setError('')
  }

  const runEE = async () => {
    if (!bounds) return
    setBusy(true)
    setError('')
    try {
      const r = await onExportViaEE({ layerId: layer.layerId, bounds, scale: Number(scale), crs, bands: bands.length ? bands : null, format })
      setResult(r)
      openUrl(r.url)
    } catch (e) {
      setError(String(e?.message ?? e))
    } finally {
      setBusy(false)
    }
  }

  const runTiles = async () => {
    if (!bounds) return
    setBusy(true)
    setError('')
    setProgress({ done: 0, total: tileRange?.count ?? 0 })
    try {
      const r = await onExportTiles({ layerId: layer.layerId, bounds, z: zoom, onProgress: setProgress })
      downloadBlob(r.blob, safeFilename(`${layer.name}_z${zoom}_3857`, 'tif'))
      setResult({ tiles: r.tileCount, width: r.width, height: r.height, bytes: r.bytes })
    } catch (e) {
      setError(String(e?.message ?? e))
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const applyMapView = () => {
    const v = getMapView?.()
    if (v?.bounds) changeBounds(roundBounds(v.bounds, 4).join(', '))
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={busy ? undefined : onClose}>
      <div className="modal modal-wide export-modal" onClick={(e) => e.stopPropagation()}>
        <h3>エクスポート: {layer.name}</h3>
        <div className="tab-bar export-tabs" role="tablist">
          <button role="tab" className={`tab-button${tab === 'ee' ? ' active' : ''}`} onClick={() => changeTab('ee')}>
            EE からダウンロード
          </button>
          <button role="tab" className={`tab-button${tab === 'tiles' ? ' active' : ''}`} onClick={() => changeTab('tiles')} disabled={!isRaw} title={isRaw ? '' : 'raw モードのレイヤーのみ'}>
            表示タイルから（raw）
          </button>
        </div>

        <div className="export-row">
          <label>範囲 [west, south, east, north]</label>
          <div className="export-inline">
            <input type="text" value={boundsText} onChange={(e) => changeBounds(e.target.value)} placeholder="139.0, 35.0, 140.0, 36.0" />
            <button type="button" className="ghost-button" onClick={applyMapView}>
              現在の表示範囲
            </button>
          </div>
          {!bounds && <p className="field-help warn">数値 4 つをカンマ区切りで入力してください。</p>}
        </div>

        {tab === 'ee' ? (
          <>
            <div className="export-grid">
              <label>
                <span>解像度 scale (m)</span>
                <input type="number" min="1" step="any" value={scale} onChange={(e) => changeScale(e.target.value)} />
              </label>
              <label>
                <span>CRS</span>
                <select value={crs} onChange={(e) => changeCrs(e.target.value)}>
                  <option value="EPSG:4326">EPSG:4326（経緯度）</option>
                  <option value="EPSG:3857">EPSG:3857（Web メルカトル）</option>
                </select>
              </label>
              <label>
                <span>形式</span>
                <select value={format} onChange={(e) => changeFormat(e.target.value)}>
                  <option value="geotiff">GeoTIFF（生データ・元の型）</option>
                  <option value="png">PNG（レイヤーの vis で可視化）</option>
                </select>
              </label>
            </div>
            {layer.bandNames?.length > 0 && format === 'geotiff' && (
              <div className="export-row">
                <label>バンド（未選択=全て）</label>
                <div className="export-bands">
                  {layer.bandNames.map((b) => (
                    <label key={b} className="band-check">
                      <input type="checkbox" checked={bands.includes(b)} onChange={() => toggleBand(b)} /> {b}
                    </label>
                  ))}
                </div>
              </div>
            )}
            {estimate && (
              <p className={`field-help${estimate.overLimit && format === 'geotiff' ? ' warn' : ''}`}>
                推定: {estimate.width}×{estimate.height} px × {Math.max(1, bands.length || layer.bandNames?.length || 1)} バンド ≒ {estimate.mb.toFixed(1)} MB
                {format === 'geotiff' ? `（上限 ${Math.round(DOWNLOAD_LIMIT_BYTES / 1024 / 1024)} MB）` : ''}
                {estimate.overLimit && format === 'geotiff' ? ` — 超過。scale を ${estimate.suggestedScale} m 以上に。` : ''}
                {crs === 'EPSG:4326' ? ' EPSG:4326 は画素が緯度方向に非正方になります。' : ''}
              </p>
            )}
            <p className="field-help">EE 側で再計算してダウンロード URL を作ります（数秒〜数十秒）。PNG 以外は可視化を適用しない生の値です。</p>
          </>
        ) : (
          <>
            <div className="export-grid">
              <label>
                <span>ズーム（タイル解像度）</span>
                <input type="number" min="0" max="20" value={zoom} onChange={(e) => changeZoom(Number(e.target.value))} />
              </label>
            </div>
            {tileRange && (
              <p className={`field-help${tileRange.count > MAX_TILES ? ' warn' : ''}`}>
                タイル数 {tileRange.count}（上限 {MAX_TILES}）→ {tileRange.cols * 256}×{tileRange.rows * 256} px ≒ {(tileBytes / 1024 / 1024).toFixed(1)} MB（float32, EPSG:3857, バンド: {(layer.runtime?.bandIds ?? []).join(', ') || '—'}）
                {tileRange.count > MAX_TILES ? ' — ズームを下げるか範囲を狭めてください。' : ''}
              </p>
            )}
            <p className="field-help">
              表示に使っている float タイルをそのまま結合します（EE の再計算なし）。band_math を使っている場合は演算前の配信バンドが書き出されます。
              {progress ? ` 取得中 ${progress.done}/${progress.total}` : ''}
            </p>
          </>
        )}

        {error && <p className="test-result error">✗ {error}</p>}
        {result && tab === 'ee' && (
          <p className="test-result ok">
            ✓ URL を作成しました（ダウンロードが始まらない場合は{' '}
            <a href={result.url} target="_blank" rel="noopener noreferrer">
              こちら
            </a>
            ）。{result.filename}
          </p>
        )}
        {result && tab === 'tiles' && (
          <p className="test-result ok">
            ✓ 保存しました: {result.width}×{result.height} px、{result.tiles} タイル、{(result.bytes / 1024 / 1024).toFixed(1)} MB
          </p>
        )}

        <div className="modal-actions">
          <button onClick={onClose} disabled={busy}>
            閉じる
          </button>
          {tab === 'ee' ? (
            <button className="primary" onClick={runEE} disabled={busy || !bounds || !(Number(scale) > 0) || (format === 'geotiff' && estimate?.overLimit)}>
              {busy ? '作成中…' : 'URL を作成してダウンロード'}
            </button>
          ) : (
            <button className="primary" onClick={runTiles} disabled={busy || !bounds || !tileRange || tileRange.count > MAX_TILES || layer.runtime?.status !== 'ready'}>
              {busy ? '取得中…' : 'GeoTIFF を保存'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default ExportLayerModal
