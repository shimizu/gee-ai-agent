// 音声データ変換（PCM ↔ Float32 ↔ base64）の単体テスト。
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  base64Pcm16ToFloat32,
  base64ToBytes,
  base64ToPcm16,
  float32ToBase64Pcm16,
  float32ToPcm16,
  pcm16ToBase64,
  pcm16ToFloat32,
} from '../src/voice/pcm.js'

test('Float32 は範囲外をクリップして 16bit PCM になる', () => {
  const pcm = float32ToPcm16(new Float32Array([0, 1, -1, 1.5, -1.5]))
  assert.equal(pcm[0], 0)
  assert.equal(pcm[1], 32767)
  assert.equal(pcm[2], -32768)
  // クリップされて上限・下限に収まる。
  assert.equal(pcm[3], 32767)
  assert.equal(pcm[4], -32768)
})

test('PCM16 と Float32 は往復しても誤差が量子化幅に収まる', () => {
  const source = new Float32Array([0, 0.25, -0.25, 0.5, -0.75])
  const roundTrip = pcm16ToFloat32(float32ToPcm16(source))
  for (let i = 0; i < source.length; i += 1) {
    assert.ok(Math.abs(roundTrip[i] - source[i]) < 1 / 32767)
  }
})

test('base64 は little-endian で往復する', () => {
  const samples = new Int16Array([0, 1, -1, 256, -32768, 32767])
  const restored = base64ToPcm16(pcm16ToBase64(samples))
  assert.deepEqual(Array.from(restored), Array.from(samples))
})

test('先頭 2 バイトが little-endian で並ぶ', () => {
  // 0x0102 = 258 → LE では 02 01 の順。
  const base64 = pcm16ToBase64(new Int16Array([258]))
  const bytes = base64ToBytes(base64)
  assert.equal(bytes[0], 0x02)
  assert.equal(bytes[1], 0x01)
})

test('長いチャンクでも base64 化できる（String.fromCharCode の引数上限対策）', () => {
  const samples = new Int16Array(100000)
  for (let i = 0; i < samples.length; i += 1) samples[i] = (i % 65536) - 32768
  const restored = base64ToPcm16(pcm16ToBase64(samples))
  assert.equal(restored.length, samples.length)
  assert.equal(restored[99999], samples[99999])
})

test('マイク → 送信 → 再生の近道関数が繋がる', () => {
  const source = new Float32Array([0, 0.5, -0.5])
  const restored = base64Pcm16ToFloat32(float32ToBase64Pcm16(source))
  assert.equal(restored.length, source.length)
  assert.ok(Math.abs(restored[1] - 0.5) < 1 / 32767)
})
