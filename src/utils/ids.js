// ID 生成ユーティリティ。
//
// 役割: レイヤー/チャート/メッセージの一意 ID を生成する。crypto.randomUUID が無い環境
//       （古いブラウザ・テスト）でも動くフォールバックを持つ。
export function uuid() {
  try {
    return globalThis.crypto?.randomUUID?.() ?? fallbackId()
  } catch {
    return fallbackId()
  }
}

function fallbackId() {
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

// 連番 ID（lyr_001 など）。prefix と現在の最大連番から次を採番する。
export function nextSequenceId(prefix, existingIds = []) {
  const re = new RegExp(`^${prefix}_(\\d+)$`)
  let max = 0
  for (const id of existingIds) {
    const m = re.exec(id ?? '')
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${prefix}_${String(max + 1).padStart(3, '0')}`
}
