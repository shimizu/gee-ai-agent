// API 設定（Claude APIキー / モデル / max_tokens、GEE OAuth クライアント ID / プロジェクト ID）のポップオーバー。
//
// 役割: ブラウザ直叩きに必要なキー等を入力し localStorage へ保存する UI。キーはバンドルに埋め込まず
//       利用者が入力する方針（共有端末では削除を促す）。
// 関係: 値と保存処理は useSettings が管理。ヘッダー右側に差し込む。
// 流用元: reference/web-gis-ai-agent/src/components/ApiSettings.jsx
import { VOICE_OPTIONS } from '../voice/gemini-live-client.js'
function TestResult({ result }) {
  if (!result || result.status === 'idle') return null
  return (
    <p className={`test-result ${result.status}`} role="status">
      {result.status === 'running' ? '⏳ ' : result.status === 'ok' ? '✓ ' : result.status === 'warn' ? '△ ' : '✗ '}
      {result.message}
    </p>
  )
}

function ApiSettings({ settings, isOpen, onToggle, onFieldChange, onSave, onDeleteKeys, tests, onTestClaude, onTestGee, onTestGemini }) {
  const claudeTesting = tests?.claude?.status === 'running'
  const geeTesting = tests?.gee?.status === 'running'
  const geminiTesting = tests?.gemini?.status === 'running'
  const handleSubmit = (event) => {
    event.preventDefault()
    onSave()
  }

  return (
    <div className="settings">
      <button className="secondary-button" type="button" onClick={onToggle} title="設定">
        ⚙<span className="btn-label"> 設定</span>
      </button>

      {isOpen && (
        <form className="settings-popover" aria-label="設定" onSubmit={handleSubmit}>
          <label htmlFor="claude-api-key">Claude APIキー</label>
          <input
            id="claude-api-key"
            type="password"
            value={settings.apiKey}
            placeholder="sk-ant-..."
            autoComplete="off"
            onChange={(e) => onFieldChange('apiKey', e.target.value)}
          />
          <p className="field-help">
            <a href="https://platform.claude.com/" target="_blank" rel="noopener noreferrer">
              platform.claude.com
            </a>
            で取得。ブラウザから直接 API を呼びます。
          </p>

          <label htmlFor="claude-model">Claude モデル</label>
          <input id="claude-model" type="text" value={settings.model} onChange={(e) => onFieldChange('model', e.target.value)} />

          <label htmlFor="claude-max-tokens">最大出力トークン (max_tokens)</label>
          <input
            id="claude-max-tokens"
            type="number"
            min="1"
            value={settings.maxTokens}
            onChange={(e) => onFieldChange('maxTokens', Number(e.target.value) || 0)}
          />
          <div className="test-row">
            <button type="button" className="ghost-button" onClick={onTestClaude} disabled={!settings.apiKey || claudeTesting}>
              接続テスト
            </button>
            <span className="field-help">キーとモデル名を確認（/v1/models、課金なし）</span>
          </div>
          <TestResult result={tests?.claude} />

          <hr className="settings-divider" />

          <label htmlFor="gee-client-id">GEE OAuth クライアント ID</label>
          <input
            id="gee-client-id"
            type="text"
            value={settings.geeClientId}
            placeholder="xxxx.apps.googleusercontent.com"
            autoComplete="off"
            onChange={(e) => onFieldChange('geeClientId', e.target.value)}
          />
          <label htmlFor="gee-project">GEE Cloud プロジェクト ID</label>
          <input
            id="gee-project"
            type="text"
            value={settings.geeProject}
            placeholder="my-ee-project"
            autoComplete="off"
            onChange={(e) => onFieldChange('geeProject', e.target.value)}
          />
          <div className="test-row">
            <button
              type="button"
              className="ghost-button"
              onClick={onTestGee}
              disabled={!settings.geeClientId || !settings.geeProject || geeTesting}
            >
              接続テスト（Google ログイン）
            </button>
            <span className="field-help">ログイン → Earth Engine 初期化 → 計算を確認</span>
          </div>
          <TestResult result={tests?.gee} />
          <p className="field-help">
            Google Cloud Console で「OAuth 2.0 クライアント ID（ウェブ アプリケーション）」を作り、
            <b>承認済みの JavaScript 生成元</b>にこのサイトのオリジン（開発時は http://localhost:5173）を登録してください。
            プロジェクトは Earth Engine に登録済み（Earth Engine API 有効）である必要があります。
            保存後、ヘッダーの「GEE ログイン」から Google アカウントで認証します。
          </p>

          <hr className="settings-divider" />

          <label htmlFor="gemini-api-key">Gemini API キー（音声で相談）</label>
          <input
            id="gemini-api-key"
            type="password"
            value={settings.geminiApiKey}
            placeholder="AIza..."
            autoComplete="off"
            onChange={(e) => onFieldChange('geminiApiKey', e.target.value)}
          />
          <label htmlFor="voice-model">Gemini モデル（Live）</label>
          <input id="voice-model" type="text" value={settings.voiceModel} onChange={(e) => onFieldChange('voiceModel', e.target.value)} />
          <label htmlFor="voice-name">声（Gemini prebuilt voice）</label>
          <select id="voice-name" value={settings.voiceName} onChange={(e) => onFieldChange('voiceName', e.target.value)}>
            {VOICE_OPTIONS.map(([name, note]) => (
              <option key={name} value={name}>
                {name} — {note}
              </option>
            ))}
          </select>
          <p className="field-help">次回の音声セッション開始時から反映されます（通話中の切替は一度停止してから）。</p>
          <div className="test-row">
            <button type="button" className="ghost-button" onClick={onTestGemini} disabled={!settings.geminiApiKey || geminiTesting}>
              接続テスト
            </button>
            <span className="field-help">キーとモデル名を確認（/models、課金なし）</span>
          </div>
          <TestResult result={tests?.gemini} />
          <label className="check-row">
            <input type="checkbox" checked={Boolean(settings.voiceSearch)} onChange={(e) => onFieldChange('voiceSearch', e.target.checked)} />
            音声相談で Google 検索グラウンディングを使う
          </label>
          <p className="field-help">
            最近の出来事・地名・データセット名の確認に Gemini が Google 検索を使えるようにします（別課金。無料枠超過後は検索ごとに課金）。
          </p>
          <p className="field-help">
            マイクで相談し、Gemini が Claude への指示文を作って実行まで行う機能に使います。キーは
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
              Google AI Studio
            </a>
            で取得できます。ブラウザから直接接続するため専用キーを作り、利用上限を設定しておくことをおすすめします。
          </p>

          <div className="settings-actions">
            <button type="submit" className="save-button">
              保存して閉じる
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={onDeleteKeys}
              disabled={!settings.apiKey && !settings.geeClientId && !settings.geeProject && !settings.geminiApiKey}
            >
              キーを削除
            </button>
          </div>

          <p className="field-help">
            設定はこのブラウザの localStorage に保存され、リロード後も復元されます。共有端末では使用後に必ず削除してください。
          </p>
        </form>
      )}
    </div>
  )
}

export default ApiSettings
