// Gemini Live API を叩く薄いクライアント（ブラウザ専用）。
// 流用元: reference/web-gis-ai-agent/src/voice/gemini-live-client.js（enableSearch と groundingMetadata を追加）
//
// 役割: @google/genai の live.connect を包み、WebSocket メッセージを用途別のコールバックへ
//       振り分ける。ブラウザから直接接続するため API キーはユーザーのブラウザに置かれる
//       （Claude キーと同じ姿勢。バックエンドが無く ephemeral token を発行できないため）。
// 関係: useVoiceSession が connect し、音声チャンク・地図画像・ツール応答を送る。
//       公開する関数宣言は voice-tools.js の VOICE_TOOLS だけで、アプリのツールは渡さない。
import { GoogleGenAI, Modality } from '@google/genai'

import { VOICE_TOOLS } from './voice-tools.js'
import { DEFAULT_VOICE_MODEL, DEFAULT_VOICE_NAME, normalizeVoiceName } from './voice-options.js'

// 受信メッセージを用途別コールバックへ振り分ける。
function routeMessage(message, callbacks) {
  if (message?.setupComplete) callbacks.onReady?.()

  const content = message?.serverContent
  if (content) {
    for (const part of content.modelTurn?.parts ?? []) {
      // 音声は inlineData（base64 PCM 24kHz）で届く。
      if (part.inlineData?.data) callbacks.onAudio?.(part.inlineData.data)
      if (part.text) callbacks.onText?.(part.text)
    }
    if (content.outputTranscription?.text) {
      callbacks.onOutputTranscript?.(content.outputTranscription.text)
    }
    if (content.inputTranscription?.text) {
      callbacks.onInputTranscript?.(content.inputTranscription.text)
    }
    // 割り込み時は予約済みの再生を捨てる必要がある。
    if (content.interrupted) callbacks.onInterrupted?.()
    if (content.turnComplete) callbacks.onTurnComplete?.()
    // Google 検索グラウンディングの出典・検索語（tools に googleSearch を入れたときだけ届く）。
    if (content.groundingMetadata) callbacks.onGrounding?.(content.groundingMetadata)
  }

  if (message?.toolCall) callbacks.onToolCall?.(message.toolCall)
  // 割り込みで取り消された関数呼び出し。応答を返してはいけない。
  if (message?.toolCallCancellation) callbacks.onToolCancel?.(message.toolCallCancellation)
  // サーバー都合の切断予告（残り時間つき）。
  if (message?.goAway) callbacks.onGoAway?.(message.goAway.timeLeft ?? '')
}

// Live セッションを開く。sdk を渡すとテストや差し替えができる（claude-client の fetchImpl と同じ考え方）。
// enableSearch=true で Google 検索グラウンディング（googleSearch ツール）を関数宣言と併用する。
// 検索は別課金のため既定は無効。
export function buildLiveTools({ enableSearch = false } = {}) {
  return enableSearch ? [{ googleSearch: {} }, ...VOICE_TOOLS] : VOICE_TOOLS
}

export async function connectGeminiLive({
  apiKey,
  model = DEFAULT_VOICE_MODEL,
  systemInstruction,
  callbacks = {},
  enableSearch = false,
  voiceName = DEFAULT_VOICE_NAME,
  sdk,
} = {}) {
  if (!apiKey) throw new Error('Gemini APIキーが設定されていません。')
  const ai = sdk ?? new GoogleGenAI({ apiKey })

  const session = await ai.live.connect({
    model,
    callbacks: {
      onopen: () => callbacks.onOpen?.(),
      onmessage: (message) => routeMessage(message, callbacks),
      onerror: (event) =>
        callbacks.onError?.(new Error(event?.message ?? 'Gemini Live との通信でエラーが発生しました')),
      onclose: (event) => callbacks.onClose?.(event?.reason ?? ''),
    },
    config: {
      responseModalities: [Modality.AUDIO],
      systemInstruction,
      tools: buildLiveTools({ enableSearch }),
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: normalizeVoiceName(voiceName) } } },
      // 応答は音声のみのため、画面表示用のテキストは書き起こしで受け取る。
      outputAudioTranscription: {},
      inputAudioTranscription: {},
      // 地図画像は文字が読める程度の解像度が欲しい。
      mediaResolution: 'MEDIA_RESOLUTION_MEDIUM',
      // 既定のセッション上限（音声のみ15分 / 音声+動画2分）で切れないよう履歴を圧縮する。
      contextWindowCompression: { slidingWindow: {} },
    },
  })

  return {
    // マイク音声（base64 の 16bit PCM）。sampleRate は実際の AudioContext の値を渡す。
    sendAudio(base64, sampleRate = 16000) {
      session.sendRealtimeInput({ audio: { data: base64, mimeType: `audio/pcm;rate=${sampleRate}` } })
    },
    // 地図のスクリーンショット（base64 JPEG）。
    sendImage(base64, mimeType = 'image/jpeg') {
      session.sendRealtimeInput({ video: { data: base64, mimeType } })
    },
    // 状況更新などのテキスト。3.1 系は会話中の sendClientContent 非対応のため realtime input を使う。
    sendText(text) {
      session.sendRealtimeInput({ text })
    },
    // マイクを止めるときに送り、サーバー側の音声バッファを確定させる。
    sendAudioStreamEnd() {
      session.sendRealtimeInput({ audioStreamEnd: true })
    },
    sendToolResponses(functionResponses) {
      if (!functionResponses?.length) return
      session.sendToolResponse({ functionResponses })
    },
    close() {
      try {
        session.close()
      } catch {
        // 既に閉じていれば無視。
      }
    },
  }
}
