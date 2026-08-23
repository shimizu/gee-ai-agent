// 音声ボタン（プロンプト送信ボタンの隣）。
//
// 役割: Gemini Live との音声セッションの開始/停止と、状態・書き起こし・エラーの表示だけを行う。
//       API 呼び出しやマイク操作は持たず、すべて useVoiceSession から props で受け取る。
// 関係: App が useVoiceSession の戻り値をそのまま渡し、ChatPanel の送信ボタン横に差し込む。
// 流用元: reference/web-gis-ai-agent/src/components/VoiceButton.jsx

const LABELS = {
  idle: '音声で相談',
  connecting: '接続中…',
  listening: '聞き取り中',
  speaking: '応答中',
  error: '音声エラー',
}

// 経過時間を m:ss で表示する。
function formatElapsed(seconds) {
  const m = Math.floor(seconds / 60)
  const s = String(seconds % 60).padStart(2, '0')
  return `${m}:${s}`
}

function VoiceButton({
  state = 'idle',
  transcript = '',
  error = '',
  elapsed = 0,
  disabled = false,
  disabledReason = '',
  onStart,
  onStop,
}) {
  const live = state === 'listening' || state === 'speaking'
  const busy = state === 'connecting'
  const label = LABELS[state] ?? LABELS.idle

  return (
    <div className="voice-control">
      <button
        type="button"
        className={`voice-btn${live ? ' is-live' : ''}${state === 'error' ? ' is-error' : ''}`}
        title={disabled ? disabledReason : live ? '音声セッションを終了' : 'Gemini と音声で相談する'}
        aria-label={disabled ? disabledReason : label}
        aria-pressed={live}
        disabled={disabled || busy}
        onClick={() => (live ? onStop?.() : onStart?.())}
      >
        <span aria-hidden="true">{live ? '■' : '🎙'}</span>
        <span className="voice-label">
          {live ? `${label} ${formatElapsed(elapsed)}` : busy ? label : '音声で相談'}
        </span>
      </button>
      {state === 'error' && error && <span className="voice-error">{error}</span>}
      {live && transcript && (
        <span className="voice-caption" aria-live="polite">
          {transcript}
        </span>
      )}
    </div>
  )
}

export default VoiceButton
