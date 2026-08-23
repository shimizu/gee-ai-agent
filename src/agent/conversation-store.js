// 会話ストア。
//
// 役割: Anthropic 形式の messages 配列をターンをまたいで保持し、localStorage へ永続化する。
//       Claude API はステートレスなため、過去文脈はこの配列を毎回送り直して維持する。
// 関係: App が runAgent の戻り messages を setMessages で書き戻し、次ターンへ引き継ぐ。
//       storage は注入可能でテスト時に差し替えられる。
//
// 流用元: reference/e-Stat-Web-AI-Agent/src/agent/conversation-store.js（保存キーを変更）
const STORAGE_KEY = 'gee-agent.conversation'

function resolveStorage(storage) {
  if (storage) return storage
  try {
    return globalThis.localStorage ?? null
  } catch {
    // SSR やアクセス制限環境で localStorage 参照が例外を投げる場合がある。
    return null
  }
}

export class ConversationStore {
  #messages = []
  #listeners = new Set()
  #storage

  constructor({ storage } = {}) {
    this.#storage = resolveStorage(storage)
    this.#messages = this.#load()
  }

  getMessages() {
    return this.#messages
  }

  setMessages(messages) {
    this.#messages = messages
    this.#persist()
    this.#notify()
    return this.#messages
  }

  clear() {
    this.#messages = []
    try {
      this.#storage?.removeItem(STORAGE_KEY)
    } catch {
      // 削除失敗は無視し、メモリ上は空にする。
    }
    this.#notify()
  }

  subscribe(listener) {
    this.#listeners.add(listener)
    listener(this.#messages)
    return () => this.#listeners.delete(listener)
  }

  #load() {
    try {
      const raw = this.#storage?.getItem(STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  #persist() {
    try {
      this.#storage?.setItem(STORAGE_KEY, JSON.stringify(this.#messages))
    } catch {
      // quota 超過などで保存に失敗してもメモリ保持は継続する。
    }
  }

  #notify() {
    for (const listener of this.#listeners) listener(this.#messages)
  }
}
