// Gemini からの音声チャンクを途切れなく再生するキュー（ブラウザ専用）。
//
// 役割: Live API が返す 24kHz の 16bit PCM（base64）を AudioBuffer 化し、前のチャンクの終端に
//       繋げてスケジュール再生する。割り込み（serverContent.interrupted）時は flush() で
//       予約済みの音を即座に捨てる。
// 関係: useVoiceSession が enqueue / flush / close を呼ぶ。復号は pcm.js（純関数）に委譲する。
import { base64Pcm16ToFloat32 } from './pcm.js'

const OUTPUT_SAMPLE_RATE = 24000
// 最初のチャンクを鳴らすまでの余裕。詰めすぎると先頭が欠ける。
const SCHEDULE_AHEAD = 0.08

export function createAudioPlayer({ sampleRate = OUTPUT_SAMPLE_RATE, onStateChange } = {}) {
  let context = null
  let nextStartTime = 0
  const playing = new Set()

  function notify() {
    onStateChange?.(playing.size > 0)
  }

  function ensureContext() {
    if (!context) {
      const AudioCtx = globalThis.AudioContext
      if (!AudioCtx) throw new Error('このブラウザは WebAudio に対応していません。')
      context = new AudioCtx({ sampleRate })
      nextStartTime = 0
    }
    // ユーザー操作前に作られた AudioContext は suspended のことがある。
    if (context.state === 'suspended') context.resume().catch(() => {})
    return context
  }

  return {
    // base64 の PCM を 1 チャンク受け取り、キューの末尾に繋いで再生予約する。
    enqueue(base64) {
      const samples = base64Pcm16ToFloat32(base64)
      if (!samples.length) return
      const ctx = ensureContext()
      const buffer = ctx.createBuffer(1, samples.length, sampleRate)
      buffer.copyToChannel(samples, 0)
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(ctx.destination)
      const startAt = Math.max(ctx.currentTime + SCHEDULE_AHEAD, nextStartTime)
      source.start(startAt)
      nextStartTime = startAt + buffer.duration
      playing.add(source)
      source.onended = () => {
        playing.delete(source)
        notify()
      }
      notify()
    },

    // 予約済みの再生を全部止める（ユーザーが割り込んだとき）。
    flush() {
      playing.forEach((source) => {
        source.onended = null
        try {
          source.stop()
        } catch {
          // 既に終わっていれば無視。
        }
      })
      playing.clear()
      nextStartTime = 0
      notify()
    },

    isPlaying() {
      return playing.size > 0
    },

    async close() {
      this.flush()
      if (context) {
        await context.close().catch(() => {})
        context = null
      }
    },
  }
}
