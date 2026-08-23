// 会話履歴のコンパクション。
//
// 役割: トークンを抑えるため、直近以外のメッセージの tool_result 本文だけをプレースホルダへ
//       置換する。tool_use と tool_result の対応（ブロックと ID）は保持するので整合性は崩れない。
//       レイヤーとデータセットはストアに残るため、必要なら list_layers / inspect_dataset で再取得できる。
// 関係: runtime.js が runAgent 冒頭で履歴に適用する。
//
// 流用元: reference/e-Stat-Web-AI-Agent/src/agent/compaction.js（文言を地理空間向けに調整）
export const COMPACT_KEEP_RECENT_MESSAGES = 8
export const COMPACT_PLACEHOLDER =
  '[古い結果は省略しました。必要なら list_layers / list_datasets / inspect_dataset で再取得してください]'

export function compactConversation(
  messages,
  {
    keepRecentMessages = COMPACT_KEEP_RECENT_MESSAGES,
    placeholder = COMPACT_PLACEHOLDER,
  } = {},
) {
  if (messages.length <= keepRecentMessages) return messages

  const cutoff = messages.length - keepRecentMessages

  return messages.map((message, index) => {
    if (index >= cutoff) return message
    if (!Array.isArray(message.content)) return message

    let changed = false
    const content = message.content.map((block) => {
      if (block?.type !== 'tool_result') return block
      if (block.content === placeholder) return block
      changed = true
      return { ...block, content: placeholder }
    })

    return changed ? { ...message, content } : message
  })
}
