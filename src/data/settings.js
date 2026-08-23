// 設定（API キー・モデル・GEE 認証情報）の localStorage 入出力。
//
// 役割: 保存キーと既定値を一箇所に集約し、読み書きを try/catch で包む
//       （アクセス制限環境でも画面は動くようにする）。
// 関係: hooks/useSettings.js が使う。キーはバンドルに埋め込まず利用者が入力する。
export const SETTINGS_KEYS = {
  apiKey: 'gee-agent.apiKey',
  model: 'gee-agent.model',
  maxTokens: 'gee-agent.maxTokens',
  geeClientId: 'gee-agent.geeClientId',
  geeProject: 'gee-agent.geeProject',
  geminiApiKey: 'gee-agent.geminiApiKey',
  voiceModel: 'gee-agent.voiceModel',
  voiceSearch: 'gee-agent.voiceSearch',
  voiceName: 'gee-agent.voiceName',
  introSeen: 'gee-agent.introSeen',
}

export const DEFAULT_MODEL = 'claude-opus-4-8'
export const DEFAULT_MAX_TOKENS = 16000
export const DEFAULT_VOICE_MODEL = 'gemini-3.1-flash-live-preview'
export const DEFAULT_VOICE_NAME = 'Kore'

export function loadSetting(key, fallback = '') {
  try {
    return globalThis.localStorage?.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

export function saveSetting(key, value) {
  try {
    if (value == null || value === '') globalThis.localStorage?.removeItem(key)
    else globalThis.localStorage?.setItem(key, String(value))
  } catch {
    // 保存失敗は致命的でない（メモリ上の設定は有効）。
  }
}

export function loadAllSettings() {
  return {
    apiKey: loadSetting(SETTINGS_KEYS.apiKey),
    model: loadSetting(SETTINGS_KEYS.model) || DEFAULT_MODEL,
    maxTokens: Number(loadSetting(SETTINGS_KEYS.maxTokens)) || DEFAULT_MAX_TOKENS,
    geeClientId: loadSetting(SETTINGS_KEYS.geeClientId),
    geeProject: loadSetting(SETTINGS_KEYS.geeProject),
    geminiApiKey: loadSetting(SETTINGS_KEYS.geminiApiKey),
    voiceModel: loadSetting(SETTINGS_KEYS.voiceModel) || DEFAULT_VOICE_MODEL,
    voiceSearch: loadSetting(SETTINGS_KEYS.voiceSearch) === '1',
    voiceName: loadSetting(SETTINGS_KEYS.voiceName) || DEFAULT_VOICE_NAME,
  }
}
