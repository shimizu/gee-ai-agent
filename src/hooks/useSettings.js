// 設定（Claude API キー・モデル・max_tokens・GEE OAuth クライアント ID・プロジェクト）の結線フック。
//
// 役割: 設定値の state と localStorage への保存/削除、設定ポップオーバーの開閉を持つ。
// 関係: App が ApiSettings へ渡し、useGeeClient / useAgentSession が値を使う。
import { useCallback, useState } from 'react'
import { loadAllSettings, saveSetting, SETTINGS_KEYS } from '../data/settings.js'
import { testClaudeConnection } from '../agent/claude-client.js'
import { testGeminiConnection } from '../voice/gemini-test.js'

const IDLE = { status: 'idle', message: '' }

export function useSettings() {
  const [settings, setSettings] = useState(loadAllSettings)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // 接続テストの結果（claude / gee）。{ status: idle|running|ok|error, message }
  const [tests, setTests] = useState({ claude: IDLE, gee: IDLE, gemini: IDLE })

  const setField = useCallback((name, value) => {
    setSettings((cur) => ({ ...cur, [name]: value }))
    // 値を変えたら古いテスト結果は消す。
    if (name === 'apiKey' || name === 'model') setTests((t) => ({ ...t, claude: IDLE }))
    if (name === 'geeClientId' || name === 'geeProject') setTests((t) => ({ ...t, gee: IDLE }))
    if (name === 'geminiApiKey' || name === 'voiceModel') setTests((t) => ({ ...t, gemini: IDLE }))
  }, [])

  const testClaude = useCallback(async () => {
    setTests((t) => ({ ...t, claude: { status: 'running', message: '確認中…' } }))
    const r = await testClaudeConnection({ apiKey: settings.apiKey, model: settings.model })
    setTests((t) => ({ ...t, claude: { status: r.ok ? (r.modelFound ? 'ok' : 'warn') : 'error', message: r.message } }))
    return r
  }, [settings.apiKey, settings.model])

  const testGemini = useCallback(async () => {
    setTests((t) => ({ ...t, gemini: { status: 'running', message: '確認中…' } }))
    const r = await testGeminiConnection({ apiKey: settings.geminiApiKey, model: settings.voiceModel })
    setTests((t) => ({ ...t, gemini: { status: r.ok ? (r.modelFound ? 'ok' : 'warn') : 'error', message: r.message } }))
    return r
  }, [settings.geminiApiKey, settings.voiceModel])

  // GEE のテスト本体は useGeeClient が持つ（ee インスタンス所有のため）。ここは結果表示の state だけ扱う。
  const runGeeTest = useCallback(
    async (tester) => {
      setTests((t) => ({ ...t, gee: { status: 'running', message: 'Google ログイン → Earth Engine 初期化を確認中…' } }))
      const r = await tester({ clientId: settings.geeClientId, project: settings.geeProject })
      setTests((t) => ({ ...t, gee: { status: r.ok ? 'ok' : 'error', message: r.message } }))
      return r
    },
    [settings.geeClientId, settings.geeProject],
  )

  const save = useCallback(() => {
    const clean = {
      ...settings,
      apiKey: String(settings.apiKey ?? '').trim(),
      geeClientId: String(settings.geeClientId ?? '').trim(),
      geeProject: String(settings.geeProject ?? '').trim(),
      geminiApiKey: String(settings.geminiApiKey ?? '').trim(),
    }
    setSettings(clean)
    saveSetting(SETTINGS_KEYS.apiKey, clean.apiKey)
    saveSetting(SETTINGS_KEYS.model, clean.model)
    saveSetting(SETTINGS_KEYS.maxTokens, String(clean.maxTokens))
    saveSetting(SETTINGS_KEYS.geeClientId, clean.geeClientId)
    saveSetting(SETTINGS_KEYS.geeProject, clean.geeProject)
    saveSetting(SETTINGS_KEYS.geminiApiKey, clean.geminiApiKey)
    saveSetting(SETTINGS_KEYS.voiceModel, clean.voiceModel)
    saveSetting(SETTINGS_KEYS.voiceSearch, clean.voiceSearch ? '1' : '')
    setSettingsOpen(false)
    return clean
  }, [settings])

  const deleteKeys = useCallback(() => {
    setSettings((cur) => ({ ...cur, apiKey: '', geeClientId: '', geeProject: '', geminiApiKey: '' }))
    saveSetting(SETTINGS_KEYS.apiKey, '')
    saveSetting(SETTINGS_KEYS.geminiApiKey, '')
    saveSetting(SETTINGS_KEYS.geeClientId, '')
    saveSetting(SETTINGS_KEYS.geeProject, '')
  }, [])

  return { settings, setField, save, deleteKeys, settingsOpen, setSettingsOpen, tests, testClaude, testGemini, runGeeTest }
}
