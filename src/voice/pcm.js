// 音声データ変換（純関数・ブラウザ非依存）。
//
// 役割: Gemini Live API がやり取りする raw PCM（16bit・little-endian）と、WebAudio が扱う
//       Float32、および WebSocket に載せる base64 の相互変換を担う。DOM / WebAudio に
//       触れないため node --test で検証できる。
// 関係: audio-capture がマイク音声を pcm16Base64 へ、audio-player が受信音声を Float32 へ戻す。

// 一度に btoa へ渡す文字数。大きな配列で String.fromCharCode の引数上限を超えないよう分割する。
const CHUNK = 0x8000

// Float32（-1.0〜1.0）を 16bit PCM へ量子化する。範囲外はクリップする。
export function float32ToPcm16(input) {
  const out = new Int16Array(input.length)
  for (let i = 0; i < input.length; i += 1) {
    const s = Math.max(-1, Math.min(1, input[i]))
    // 負側は 32768、正側は 32767 を掛けて対称にクリップする。
    out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff)
  }
  return out
}

// 16bit PCM を Float32（-1.0〜1.0）へ戻す。
export function pcm16ToFloat32(input) {
  const out = new Float32Array(input.length)
  for (let i = 0; i < input.length; i += 1) {
    out[i] = input[i] / (input[i] < 0 ? 0x8000 : 0x7fff)
  }
  return out
}

// バイト列を base64 文字列へ。分割して btoa に渡す。
export function bytesToBase64(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  return globalThis.btoa(binary)
}

// base64 文字列をバイト列へ。
export function base64ToBytes(base64) {
  const binary = globalThis.atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// 16bit PCM を little-endian のバイト列として base64 化する。
// 実行環境のエンディアンに依存しないよう DataView で明示的に書く。
export function pcm16ToBase64(samples) {
  const bytes = new Uint8Array(samples.length * 2)
  const view = new DataView(bytes.buffer)
  for (let i = 0; i < samples.length; i += 1) view.setInt16(i * 2, samples[i], true)
  return bytesToBase64(bytes)
}

// little-endian PCM の base64 を Int16Array へ戻す。奇数バイトの余りは切り捨てる。
export function base64ToPcm16(base64) {
  const bytes = base64ToBytes(base64)
  const count = Math.floor(bytes.length / 2)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const out = new Int16Array(count)
  for (let i = 0; i < count; i += 1) out[i] = view.getInt16(i * 2, true)
  return out
}

// マイクの Float32 チャンクを、そのまま送信できる base64 PCM へ変換する近道。
export function float32ToBase64Pcm16(input) {
  return pcm16ToBase64(float32ToPcm16(input))
}

// 受信した base64 PCM を再生用の Float32 へ戻す近道。
export function base64Pcm16ToFloat32(base64) {
  return pcm16ToFloat32(base64ToPcm16(base64))
}
