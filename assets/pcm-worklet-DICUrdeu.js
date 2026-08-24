// マイク入力を取り出す AudioWorkletProcessor。
//
// 役割: 入力バッファ（Float32 / モノラル）をコピーしてメインスレッドへ postMessage するだけ。
//       PCM への量子化と base64 化は pcm.js（純関数）側で行い、ここは最小限に留める。
// 関係: audio-capture.js が new URL('./pcm-worklet.js', import.meta.url) で addModule する。
//       AudioWorklet のスコープには window も document も無いため、import は書けない。
class PcmCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0]
    if (channel && channel.length) {
      // 入力バッファは次の呼び出しで再利用されるためコピーして渡す（転送してゼロコピーにする）。
      const copy = new Float32Array(channel)
      this.port.postMessage(copy, [copy.buffer])
    }
    // false を返すとノードが破棄されるので、停止するまで true を返し続ける。
    return true
  }
}

registerProcessor('pcm-capture', PcmCaptureProcessor)
