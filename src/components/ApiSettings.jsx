// API 設定（Claude APIキー / モデル / max_tokens、GEE OAuth クライアント ID / プロジェクト ID）のポップオーバー。
//
// 役割: ブラウザ直叩きに必要なキー等を入力し localStorage へ保存する UI。キーはバンドルに埋め込まず
//       利用者が入力する方針（共有端末では削除を促す）。
// 関係: 値と保存処理は useSettings が管理。ヘッダー右側に差し込む。
// 流用元: reference/web-gis-ai-agent/src/components/ApiSettings.jsx
function TestResult({ result }) {
  if (!result || result.status === 'idle') return null
  return (
    <p className={`test-result ${result.status}`} role="status">
      {result.status === 'running' ? '⏳ ' : result.status === 'ok' ? '✓ ' : result.status === 'warn' ? '△ ' : '✗ '}
      {result.message}
    </p>
  )
}

function ApiSettings({ settings, isOpen, onToggle, onFieldChange, onSave, onDeleteKeys, tests, onTestClaude, onTestGee }) {
  const claudeTesting = tests?.claude?.status === 'running'
  const geeTesting = tests?.gee?.status === 'running'
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

          <div className="settings-actions">
            <button type="submit" className="save-button">
              保存して閉じる
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={onDeleteKeys}
              disabled={!settings.apiKey && !settings.geeClientId && !settings.geeProject}
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
