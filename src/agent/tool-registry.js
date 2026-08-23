// ツールレジストリ。
//
// 役割: ツールの「定義（LLM へ渡す JSON スキーマ）」と「実装（ハンドラ）」を同じ名前で
//       1 対 1 に管理し、定義と実行のずれを防ぐ。
// 関係: register-tools.js が 6 ツールをここに登録し、runtime.js の runAgent が
//       definitions()/execute() を呼ぶ。
//
// 流用元: reference/e-Stat-Web-AI-Agent/src/agent/tool-registry.js（そのまま）
export class ToolRegistry {
  #tools = new Map()

  // ツール定義と実装を同じ名前で管理する。
  register(definition, handler) {
    if (!definition?.name) {
      throw new Error('ツール定義には name が必要です。')
    }
    if (typeof handler !== 'function') {
      throw new Error(`ツール「${definition.name}」の実装が関数ではありません。`)
    }
    if (this.#tools.has(definition.name)) {
      throw new Error(`ツール「${definition.name}」は既に登録されています。`)
    }

    this.#tools.set(definition.name, { definition, handler })
    return this
  }

  definitions() {
    return [...this.#tools.values()].map(({ definition }) => definition)
  }

  has(name) {
    return this.#tools.has(name)
  }

  async execute(name, input, context) {
    const tool = this.#tools.get(name)
    if (!tool) {
      throw new Error(`未登録のツールが要求されました: ${name}`)
    }
    return tool.handler(input, context)
  }
}
