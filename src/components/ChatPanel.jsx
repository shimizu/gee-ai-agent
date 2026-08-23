// チャットパネル。
//
// 役割: ユーザー入力と、エージェントのメッセージ（途中経過 / 最終回答 / お知らせ / チャートカード）を表示する。
//       kind により表示を出し分ける: progress=控えめ、notice=注意色、chart=ChartCard、最終回答=Markdown。
// 関係: messages/isRunning は useAgentSession が保持。チャートは chartsById から chartId で引く。
//       voiceSlot は音声（Gemini Live）の操作 UI をスロットで差し込む。
// 流用元: reference/web-gis-ai-agent/src/components/ChatPanel.jsx（チャートカードを追加）
import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import AgentHelpModal from './AgentHelpModal.jsx'
import ChartCard from './ChartCard.jsx'

function ChatPanel({
  messages,
  isRunning,
  disabled,
  disabledReason,
  input,
  onInputChange,
  inputRef,
  onSubmit,
  onAbort,
  onReset,
  chartsById,
  onOpenChart,
  voiceSlot,
}) {
  const lastSubmittedRef = useRef('')
  const [helpOpen, setHelpOpen] = useState(false)
  const listRef = useRef(null)

  // 新しいメッセージが来たら末尾へスクロール。
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, isRunning])

  const handleSubmit = (event) => {
    event.preventDefault()
    const content = input.trim()
    if (!content || isRunning || disabled) return
    if (content === lastSubmittedRef.current) {
      window.alert('同じ内容が連続で送信されました。内容を変えてください。')
      return
    }
    lastSubmittedRef.current = content
    onInputChange('')
    onSubmit(content)
  }

  const handleReset = () => {
    if (!window.confirm('新しい会話を始めると、会話・レイヤー・データセット・チャートがすべて消去されます。よろしいですか？')) return
    lastSubmittedRef.current = ''
    onReset()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(e)
  }

  return (
    <section className="chat-panel">
      <div className="chat-header">
        <div className="chat-title">
          <h3>エージェント</h3>
          <button type="button" className="icon-btn" title="使い方・サンプルプロンプト" aria-label="使い方" onClick={() => setHelpOpen(true)}>
            ⓘ
          </button>
        </div>
        <div className="chat-header-actions">
          <button type="button" className="link-btn" onClick={handleReset} disabled={isRunning}>
            新しい会話
          </button>
          <span className={`chat-status${isRunning ? ' is-running' : ''}`}>{isRunning ? '実行中' : '待機中'}</span>
        </div>
      </div>

      <div className="message-list" aria-live="polite" ref={listRef}>
        {messages.length === 0 && !disabled && (
          <p className="empty-state">例: 「東京湾周辺の 2024 年夏の Sentinel-2 真色画像を表示して」「シンガポール港の入港数推移をグラフに」</p>
        )}
        {messages.map((message) => {
          const isProgress = message.kind === 'progress'
          const isNotice = message.kind === 'notice'
          const isChart = message.kind === 'chart'
          const label = message.role === 'user' ? 'You' : isProgress ? '途中経過' : isNotice ? 'お知らせ' : isChart ? 'チャート' : 'Agent'
          return (
            <article
              className={`message message-${message.role}${isProgress ? ' message-progress' : ''}${isNotice ? ' message-notice' : ''}${isChart ? ' message-chart' : ''}`}
              key={message.id}
            >
              <span className="message-label">{label}</span>
              {isChart ? (
                <ChartCard chart={chartsById?.get(message.chartId)} onOpen={onOpenChart} />
              ) : message.role === 'assistant' && !isProgress && !isNotice ? (
                <div className="message-markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                </div>
              ) : (
                <p>{message.content}</p>
              )}
            </article>
          )
        })}
        {isRunning && (
          <div className="message-spinner" role="status">
            <span>処理中…（Earth Engine の計算は数十秒かかることがあります）</span>
          </div>
        )}
      </div>

      <form className="prompt-form" onSubmit={handleSubmit}>
        {disabled ? (
          <p className="prompt-disabled">{disabledReason}</p>
        ) : (
          <>
            <textarea
              ref={inputRef}
              value={input}
              rows={3}
              placeholder="自然言語で分析を指示…（Ctrl/⌘+Enter で送信）"
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <div className="prompt-actions">
              {voiceSlot ?? <span />}
              {isRunning ? (
                <button type="button" onClick={onAbort}>
                  中断
                </button>
              ) : (
                <button type="submit" disabled={!input.trim()}>
                  送信
                </button>
              )}
            </div>
          </>
        )}
      </form>

      {helpOpen && (
        <AgentHelpModal
          onClose={() => setHelpOpen(false)}
          onPick={(text) => {
            onInputChange(text)
            setHelpOpen(false)
            inputRef?.current?.focus()
          }}
        />
      )}
    </section>
  )
}

export default ChatPanel
