// 音声エージェント（Gemini Live）の system instruction 組み立て（純関数・ブラウザ非依存）。
//
// 役割: Gemini に「自分は分析を実行せず、ユーザーと会話して Claude への指示文を作り、run_prompt で
//       実行を依頼する相棒だ」と伝える文面を作る。現在のレイヤー・データセット・GEE 状態を材料として渡す。
// 関係: useVoiceSession が接続時に渡す。会話中の変化は buildContextSnapshot() をツール応答へ同梱し、
//       Claude の完了は buildCompletionNotice() をテキストで送って読み上げさせる。
// 流用元: reference/web-gis-ai-agent/src/voice/voice-instruction.js
const BASE = `あなたは「gee-ai-agent」という衛星データ分析アプリの音声アシスタントです。

## このアプリについて
- ブラウザだけで動く Google Earth Engine（GEE）の分析ワークベンチです。実際の処理を行うのは内蔵の **Claude エージェント**で、自然言語の指示から Earth Engine のコードを書いて実行し、結果を地図レイヤー（衛星画像・指標・標高など）やチャット内のチャート、数値で返します。
- IMF PortWatch（世界の港の入港数・貿易量・波及リスク・災害）も扱え、港の情報と衛星データを組み合わせた分析ができます。
- Claude ができること: 衛星画像や指標（NDVI・夜間光・降水・標高・土地被覆など）の地図表示、領域の統計値、時系列のチャート化、港のデータ取得と分析、GeoTIFF/CSV のエクスポート。

## あなたの役割
- あなた自身はデータを処理しません。**ユーザーと会話して Claude への指示文をまとめ、run_prompt で実行を依頼する**のが仕事です。
- やりたいことが曖昧なときは、場所・期間・知りたいこと（地図に出す／数値／推移）の 3 点が埋まるまで質問してください。十分に具体的なら、すぐ run_prompt を呼んでかまいません。
- run_prompt を呼ぶと入力欄に書き込まれて**そのまま送信・実行されます**。呼んだら「実行を依頼しました。少しお待ちください」と短く伝えてください。
- Claude が実行中に run_prompt を呼ぶと busy で拒否されます。その場合は待つように伝え、完了してから呼び直してください。
- Claude の実行が完了すると、結果の要約が「【Claude 完了】」で始まるテキストで届きます。それを 1〜2 文で噛み砕いてユーザーに伝え、次に何をするか聞いてください。
- 地図の見た目を確認しないと答えられないときだけ capture_map を呼びます。連続では呼ばないでください。
- レイヤー名・データセット ID は下の一覧にあるものをそのまま使ってください。

## 話し方
- 日本語で話します。
- 音声なので短く、1 度に 1 つだけ質問します。長い説明や箇条書きの読み上げは避けてください。
- 衛星データの専門用語は噛み砕いて説明します。数値は単位を添えます。`

export function formatLayersForVoice(layers = []) {
  if (!layers.length) return '（まだレイヤーはありません）'
  return layers
    .map((l) => {
      const parts = []
      if (l.kind === 'ee-raster') {
        parts.push(`衛星ラスター/${l.spec?.mode ?? 'png'}`)
        if (l.bandNames?.length) parts.push(`バンド ${l.bandNames.slice(0, 3).join(',')}`)
      } else {
        parts.push(`${l.geomType ?? 'ベクター'} ${l.featureCount ?? '?'} 件`)
      }
      if (l.visible === false) parts.push('非表示')
      return `- ${l.name}（${l.layerId}: ${parts.join(', ')}）`
    })
    .join('\n')
}

export function formatDatasetsForVoice(datasets = []) {
  if (!datasets.length) return ''
  const lines = datasets.map((d) => `- ${d.id}: ${d.title}（${d.recordCount} 行${d.dateRange ? `, ${d.dateRange.from}〜${d.dateRange.to}` : ''}）`)
  return `## データセット\n${lines.join('\n')}`
}

export function formatGeeStateForVoice(geeState) {
  return geeState?.status === 'ready'
    ? '## GEE: ログイン済み（衛星データの分析が使えます）'
    : '## GEE: 未ログイン（衛星データの分析は失敗します。ヘッダーの「GEE ログイン」を押すようユーザーに伝えてください。港のデータ（PortWatch）は使えます）'
}

export function buildContextBlock({ layers = [], datasets = [], geeState } = {}) {
  const blocks = [formatGeeStateForVoice(geeState), `## 現在のレイヤー\n${formatLayersForVoice(layers)}`]
  const ds = formatDatasetsForVoice(datasets)
  if (ds) blocks.push(ds)
  return blocks.join('\n\n')
}

const SEARCH_GUIDE = `## Google 検索
- 最近の出来事（災害・台風・地震など）の日付や場所、地名の正確な表記、衛星データセットの名前が曖昧なときは、指示文を作る前に Google 検索で確認してください。
- 検索結果は指示文を具体的にするためだけに使い、衛星データの数値や分析結果は Claude の結果（【Claude 完了】の通知）だけを根拠にしてください。
- 検索したことは一言添える程度にし、URL は読み上げないでください。`

export function buildVoiceInstruction(context = {}) {
  const { enableSearch = false, ...rest } = context
  const blocks = [BASE]
  if (enableSearch) blocks.push(SEARCH_GUIDE)
  blocks.push(buildContextBlock(rest))
  return blocks.join('\n\n')
}

// groundingMetadata → ログ用の 1 行（検索語と出典ドメイン）。
export function describeGrounding(meta) {
  if (!meta) return ''
  const queries = Array.isArray(meta.webSearchQueries) ? meta.webSearchQueries : []
  const sources = (meta.groundingChunks ?? [])
    .map((c) => c?.web?.title || c?.web?.uri || '')
    .filter(Boolean)
    .slice(0, 3)
  const parts = []
  if (queries.length) parts.push(`検索: ${queries.slice(0, 3).join(' / ')}`)
  if (sources.length) parts.push(`出典: ${sources.join(', ')}`)
  return parts.join(' ')
}

// ツール応答へ同梱する現在の状況。
export function buildContextSnapshot({ layers = [], datasets = [], geeState, isAgentRunning = false } = {}) {
  return {
    gee_logged_in: geeState?.status === 'ready',
    claude_running: isAgentRunning,
    layers: layers.map((l) => ({
      id: l.layerId,
      name: l.name,
      kind: l.kind === 'ee-raster' ? `raster/${l.spec?.mode ?? 'png'}` : l.geomType ?? 'vector',
      visible: l.visible !== false,
    })),
    datasets: datasets.map((d) => ({ id: d.id, title: d.title, rows: d.recordCount })),
  }
}

// Claude 完了時に Gemini へ送るテキスト（読み上げ用。短く）。
export function buildCompletionNotice({ status, content = '', addedLayers = [], addedCharts = 0, maxChars = 300 } = {}) {
  const head = status === 'completed' ? '【Claude 完了】' : `【Claude 終了: ${status}】`
  const summary = String(content ?? '')
    .replace(/[#*`>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const body = summary.length > maxChars ? `${summary.slice(0, maxChars)}…` : summary || '（本文なし）'
  const extras = []
  if (addedLayers.length) extras.push(`追加レイヤー: ${addedLayers.join('、')}`)
  if (addedCharts > 0) extras.push(`チャート ${addedCharts} 件`)
  return `${head} ${body}${extras.length ? `（${extras.join(' / ')}）` : ''} これを 1〜2 文で要約してユーザーに伝え、次に何をするか聞いてください。`
}
