// system プロンプトのブロック組み立て（純関数・テスト対象）。
//
// 役割: 安定プレフィックス（BASE+スキル, cache_control）と、毎ターン変わる揮発ブロック
//       （現在日時・GEE 状態・レイヤー・データセット・地図表示範囲）を別ブロックにして返す。
//       プロンプトキャッシュはプレフィックス一致で効くため、揮発部分を安定部分に混ぜない。
// 関係: hooks/useAgentSession.js が runAgent の system として渡す。
import { composeSystemPrompt } from './system-prompt.js'
import { summarizeLayer } from '../tools/map/handlers.js'
import { roundBounds } from '../utils/format.js'

// 安定プレフィックス（BASE+スキル）と揮発ブロック（GEE 状態・レイヤー・データセット・表示範囲）を
// 別ブロックにして、安定部分のプロンプトキャッシュを効かせる。
// アクセス時の現在日時（年月日 時:分、曜日、タイムゾーン）。毎ターン評価する。
export function formatNow(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  const y = date.getFullYear()
  const m = pad(date.getMonth() + 1)
  const d = pad(date.getDate())
  const hh = pad(date.getHours())
  const mm = pad(date.getMinutes())
  const dow = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()]
  const tz = -date.getTimezoneOffset() / 60
  return `${y}-${m}-${d}（${dow}）${hh}:${mm} ローカル時刻（UTC${tz >= 0 ? '+' : ''}${tz}）`
}

export function buildSystemBlocks({ systemPrompt = composeSystemPrompt(), layers, datasets, geeState, mapView, now = new Date() }) {
  const blocks = [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }]
  const parts = []
  parts.push(
    `## 現在日時\n${formatNow(now)}。ユーザーの指定する日付・期間はこの日時を基準に解釈し、学習時点の知識で未来/過去を判断しない。`,
  )
  parts.push(
    geeState?.status === 'ready'
      ? `## GEE 状態\n- 認証: ready / project: ${geeState.project}`
      : `## GEE 状態\n- 未ログイン（status: ${geeState?.status ?? 'idle'}）。GEE 系ツールは失敗します。ユーザーにヘッダーの「GEE ログイン」を案内してください。PortWatch のツールは使えます。`,
  )
  if (layers?.length) {
    const list = layers
      .map((l) => {
        const s = summarizeLayer(l)
        const extra =
          l.kind === 'ee-raster'
            ? `${s.mode} bands=[${(s.bandNames ?? []).join(',')}]${s.mode === 'raw' ? ` colormap=${s.colormap} rescale=[${(s.rescale ?? []).join(',')}]` : ''} status=${s.status}`
            : `vector ${s.geomType ?? '?'} ${s.featureCount ?? '?'} 地物`
        return `- ${l.layerId} "${l.name}" ${extra}${l.visible === false ? ' (非表示)' : ''}`
      })
      .join('\n')
    parts.push(`## 現在のレイヤー\n${list}`)
  }
  if (datasets?.length) {
    const list = datasets
      .map(
        (d) =>
          `- ${d.id} "${d.title}" ${d.recordCount} 行 cols=[${(d.columns ?? []).slice(0, 12).join(',')}]${d.dateRange ? ` ${d.dateRange.from}〜${d.dateRange.to}` : ''} source=${d.source}`,
      )
      .join('\n')
    parts.push(`## データセット\n${list}`)
  }
  if (mapView?.bounds) {
    parts.push(`## 現在の地図表示範囲\nbounds=[${roundBounds(mapView.bounds, 2).join(', ')}] zoom=${Math.round(mapView.zoom * 10) / 10}`)
  }
  blocks.push({ type: 'text', text: parts.join('\n\n'), cache_control: { type: 'ephemeral' } })
  return blocks
}

