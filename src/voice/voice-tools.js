// 音声エージェント（Gemini Live）へ公開する関数宣言とディスパッチ（純関数・ブラウザ非依存）。
//
// 役割: Gemini に渡す functionDeclarations の定義と、toolCall を実装へ振り分ける処理を持つ。
//       公開するのは「UI 操作」だけ: run_prompt（Claude エージェントへの指示文を入力して送信まで行う）と
//       capture_map（地図のスクリーンショットを見る）。GEE / PortWatch のツールは一切渡さない
//       （分析の実行は従来どおり Claude エージェントの担当）。
// 関係: useVoiceSession がハンドラ（入力欄への書き込み＋送信・地図キャプチャ）を注入して使う。
//       例外を投げずに { ok:false, error } を返すのは runtime.js と同じ方針。
// 流用元: reference/web-gis-ai-agent/src/voice/voice-tools.js（fill_prompt → run_prompt: 送信まで行う）

export const RUN_PROMPT = 'run_prompt'
export const CAPTURE_MAP = 'capture_map'

export const VOICE_FUNCTION_DECLARATIONS = [
  {
    name: RUN_PROMPT,
    description:
      'Claude エージェントへの指示文をプロンプト入力欄に書き込み、そのまま送信して実行を開始する。' +
      'Claude が実行中のときは拒否される（ok:false, busy:true）ので、完了を待ってから呼び直す。' +
      '実行が完了すると結果の要約がテキストで届くので、それを短くユーザーに伝える。',
    parameters: {
      type: 'OBJECT',
      properties: {
        text: {
          type: 'STRING',
          description:
            'Claude エージェントへ渡す指示文の全文。日本語で、対象（場所・期間・データ）・処理内容・出力（地図レイヤー／チャート／数値）が' +
            '分かるように自己完結させる。会話の相槌は入れない。',
        },
      },
      required: ['text'],
    },
  },
  {
    name: CAPTURE_MAP,
    description:
      '現在画面に表示されている地図のスクリーンショットを取得して自分で見る。' +
      '「これ」「ここ」「この辺」など画面を指す言い方が出たときや、レイヤーの見え方を確認したいときに使う。' +
      '1 回につき 1 枚しか届かないので、連続して呼ばない。',
    parameters: {
      type: 'OBJECT',
      properties: {
        reason: { type: 'STRING', description: '地図を見たい理由（1 文）' },
      },
    },
  },
]

export const VOICE_TOOLS = [{ functionDeclarations: VOICE_FUNCTION_DECLARATIONS }]

export async function dispatchFunctionCall(call, handlers = {}) {
  const { id, name, args } = call ?? {}
  try {
    const handler = handlers[name]
    if (!handler) throw new Error(`未対応の関数です: ${name}`)
    if (name === RUN_PROMPT && typeof args?.text !== 'string') throw new Error('text が指定されていません')
    const response = await handler(args ?? {})
    return { id, name, response: response ?? { ok: true } }
  } catch (e) {
    return { id, name, response: { ok: false, error: String(e?.message ?? e) } }
  }
}

// gemini-3.1-flash-live-preview は非同期 function calling 非対応のため逐次で回す。
export async function dispatchToolCall(toolCall, handlers) {
  const calls = toolCall?.functionCalls ?? []
  const responses = []
  for (const call of calls) responses.push(await dispatchFunctionCall(call, handlers))
  return responses
}
