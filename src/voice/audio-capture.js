// マイク入力の取得（ブラウザ専用）。
//
// 役割: getUserMedia でマイクを開き、AudioWorklet で取り出した Float32 を 16bit PCM の base64 へ
//       変換して onChunk へ流す。Gemini Live API は 16kHz を前提とするため AudioContext を
//       16kHz で開くが、ブラウザが従わない場合もあるので実際のサンプルレートも返す。
// 関係: useVoiceSession が start / stop を呼ぶ。変換は pcm.js（純関数）に委譲する。
// ワークレットは new URL(..., import.meta.url) で同一オリジンの実ファイルとして配信する
// （Vite がハッシュ付きアセットとして出力し、インライン化しない）。Blob URL や data: URL に
// すると worklet のモジュールは script-src の対象なので CSP に blob:/data: が必要になり、
// 本番で "Unable to load a worklet's module." になる。
import { float32ToBase64Pcm16 } from './pcm.js'

const WORKLET_URL = new URL('./pcm-worklet.js', import.meta.url)

const TARGET_SAMPLE_RATE = 16000

// マイクを開いて音声チャンクの送出を始める。戻り値の stop() で完全に解放する。
export async function startAudioCapture({ onChunk, sampleRate = TARGET_SAMPLE_RATE } = {}) {
  const nav = globalThis.navigator
  if (!nav?.mediaDevices?.getUserMedia) {
    throw new Error('このブラウザではマイクを利用できません（HTTPS または localhost が必要です）。')
  }
  const AudioCtx = globalThis.AudioContext
  const AudioNode = globalThis.AudioWorkletNode
  if (!AudioCtx || !AudioNode) {
    throw new Error('このブラウザは AudioWorklet に対応していません。')
  }

  const stream = await nav.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true, // スピーカーから出る Gemini の声を拾い直さないようにする。
      noiseSuppression: true,
      autoGainControl: true,
    },
  })

  const context = new AudioCtx({ sampleRate })
  try {
    await context.audioWorklet.addModule(WORKLET_URL)
    const source = context.createMediaStreamSource(stream)
    const worklet = new AudioNode(context, 'pcm-capture')
    worklet.port.onmessage = (event) => {
      onChunk?.(float32ToBase64Pcm16(event.data))
    }
    source.connect(worklet)
    // 出力を鳴らす必要はないが、destination まで繋がないと process が回らないブラウザがあるため
    // ゲイン 0 のノード経由で接続する（ハウリング防止）。
    const mute = context.createGain()
    mute.gain.value = 0
    worklet.connect(mute)
    mute.connect(context.destination)

    return {
      sampleRate: context.sampleRate,
      async stop() {
        worklet.port.onmessage = null
        try {
          source.disconnect()
          worklet.disconnect()
          mute.disconnect()
        } catch {
          // 既に切断済みなら無視。
        }
        stream.getTracks().forEach((track) => track.stop())
        await context.close().catch(() => {})
      },
    }
  } catch (e) {
    // 途中で失敗したらマイクを掴んだままにしない。
    stream.getTracks().forEach((track) => track.stop())
    await context.close().catch(() => {})
    throw e
  }
}
