// 音声（Gemini Live）の定数だけを持つ純モジュール。
//
// 役割: モデル名・声色の一覧と正規化。@google/genai には依存しない。
// 関係: gemini-live-client.js（接続時の既定値）と components/ApiSettings.jsx（設定 UI の選択肢）が使う。
//       UI から gemini-live-client.js を直接読むと、useVoiceSession の動的 import が効かず
//       @google/genai が初期チャンクに入ってしまうため、定数はここに分離する。
export const DEFAULT_VOICE_MODEL = 'gemini-3.1-flash-live-preview'
// 音声の声色（既定）。native audio モデルは言語を自動判別するので言語指定はしない（system instruction で指示）。
export const DEFAULT_VOICE_NAME = 'Kore'
// 選べる声（Gemini の prebuilt voice。名前と雰囲気）。
export const VOICE_OPTIONS = [
  ['Kore', '落ち着き（既定）'],
  ['Aoede', '軽やか'],
  ['Leda', '若々しい'],
  ['Zephyr', '明るい'],
  ['Puck', '元気'],
  ['Charon', '説明調'],
  ['Fenrir', '快活'],
  ['Orus', 'しっかり'],
  ['Callirrhoe', 'ゆったり'],
  ['Autonoe', '明るい'],
  ['Enceladus', 'ささやき気味'],
  ['Iapetus', 'クリア'],
  ['Umbriel', 'ゆったり'],
  ['Algieba', 'なめらか'],
  ['Despina', 'なめらか'],
  ['Erinome', 'クリア'],
  ['Algenib', 'ハスキー'],
  ['Rasalgethi', '説明調'],
  ['Laomedeia', '元気'],
  ['Achernar', 'やわらか'],
  ['Alnilam', 'しっかり'],
  ['Schedar', '均一'],
  ['Gacrux', '大人びた'],
  ['Pulcherrima', '前向き'],
  ['Achird', '親しみやすい'],
  ['Zubenelgenubi', 'カジュアル'],
  ['Vindemiatrix', 'やさしい'],
  ['Sadachbia', '生き生き'],
  ['Sadaltager', '博識'],
  ['Sulafat', '温かい'],
]
export const VOICE_NAMES = VOICE_OPTIONS.map(([name]) => name)

export function normalizeVoiceName(name) {
  const n = String(name ?? '').trim()
  return VOICE_NAMES.includes(n) ? n : DEFAULT_VOICE_NAME
}
