// 開閉可能・幅可変のサイドパネル（汎用コンテナ）。
// 流用元: reference/web-gis-ai-agent/src/components/Sidebar.jsx
//
// 役割: 中央の地図の左右に置く縦長パネルの枠。中身（管理タブ / エージェント）は呼び出し側が
//       children で差し込む。open=false のときは描画せず、地図がその分広がる。
//       内側の縁のリサイズハンドルをドラッグして横幅を変えられる。
// 関係: App が左に管理タブ（TabbedPanel）、右にエージェント（ChatPanel）を入れて 2 つ配置し、
//       width/onWidthChange で幅を制御、Header のトグルで open を切り替える。
//
// 幅は CSS 変数 --panel-w で渡す（インライン width だと狭幅メディアクエリの width:100% を
// 特異性で上書きできないため）。
function Sidebar({
  side = 'left',
  open = true,
  width = 380,
  onWidthChange,
  minWidth = 240,
  maxWidth = 640,
  height = null,
  onHeightChange,
  minHeight = 80,
  children,
}) {
  if (!open) return null

  const clamp = (w) => Math.min(maxWidth, Math.max(minWidth, w))

  // 内側の縁のハンドルをドラッグして幅を更新する。
  // Pointer Capture でイベントを掴み、地図 canvas にポインタを奪われない（地図がパンしない）。
  const startDrag = (e) => {
    if (!onWidthChange) return
    e.preventDefault()
    const handle = e.currentTarget
    const startX = e.clientX
    const startW = width
    handle.setPointerCapture(e.pointerId)

    const onMove = (ev) => {
      // 左パネルは右へ、右パネルは左へドラッグすると広がる。
      const delta = side === 'left' ? ev.clientX - startX : startX - ev.clientX
      onWidthChange(clamp(startW + delta))
    }
    const onUp = () => {
      handle.releasePointerCapture?.(e.pointerId)
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onUp)
      handle.removeEventListener('pointercancel', onUp)
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
    handle.addEventListener('pointercancel', onUp)
  }

  // 縦（高さ）方向のドラッグ。狭幅の縦積みレイアウトでのみハンドルを表示する（app.css）。
  // 上＝管理パネル(left)は下端を下へ、下＝エージェント(right)は上端を上へドラッグで広がる。
  const startDragV = (e) => {
    if (!onHeightChange) return
    e.preventDefault()
    const handleEl = e.currentTarget
    const startY = e.clientY
    const aside = handleEl.parentElement
    const startH = aside.offsetHeight // 現在の実描画高（% 既定 → px）を起点にする
    // 地図を潰さないよう、ワークスペース高から余白を引いた値を上限にする。
    const workspaceH = aside.parentElement?.clientHeight ?? startH
    const maxHeight = Math.max(minHeight, workspaceH - 120)
    const clampH = (h) => Math.min(maxHeight, Math.max(minHeight, h))
    handleEl.setPointerCapture(e.pointerId)

    const onMove = (ev) => {
      const delta = side === 'left' ? ev.clientY - startY : startY - ev.clientY
      onHeightChange(clampH(startH + delta))
    }
    const onUp = () => {
      handleEl.releasePointerCapture?.(e.pointerId)
      handleEl.removeEventListener('pointermove', onMove)
      handleEl.removeEventListener('pointerup', onUp)
      handleEl.removeEventListener('pointercancel', onUp)
    }
    handleEl.addEventListener('pointermove', onMove)
    handleEl.addEventListener('pointerup', onUp)
    handleEl.addEventListener('pointercancel', onUp)
  }

  const handle = (
    <div
      className="resize-handle"
      onPointerDown={startDrag}
      role="separator"
      aria-orientation="vertical"
      title="ドラッグで幅を変更"
    />
  )

  const handleV = (
    <div
      className="resize-handle resize-handle-h"
      onPointerDown={startDragV}
      role="separator"
      aria-orientation="horizontal"
      title="ドラッグで高さを変更"
    >
      {/* 狭幅ではつまみ（横バー）を見せ、指で掴める高さを確保する（app.css） */}
      <span className="resize-grip" aria-hidden="true" />
    </div>
  )

  // --panel-h は高さがドラッグ指定されたときだけ付与し、未指定時は CSS 既定（%）に委ねる。
  const style = { '--panel-w': `${width}px` }
  if (height != null) style['--panel-h'] = `${height}px`

  return (
    <aside className={`sidebar sidebar-${side}`} style={style}>
      {children}
      {handle}
      {handleV}
    </aside>
  )
}

export default Sidebar
