// Earth Engine のエラー文言を日本語のヒント付きに正規化する（純関数・テスト対象）。
//
// 役割: モデルが自己修正しやすいよう、典型的な EE エラーに対処法を添える。
//       元のメッセージは必ず残す（情報を落とさない）。
const HINTS = [
  {
    test: /memory limit|User memory limit exceeded/i,
    hint: 'メモリ上限超過です。scale を粗くする、region を狭める、reduceRegion に bestEffort:true / maxPixels を指定する、tileScale を上げる、などを試してください。',
  },
  {
    test: /Too many pixels/i,
    hint: '画素数が多すぎます。maxPixels を増やす（例: 1e9）か scale を粗くしてください。',
  },
  {
    test: /Computation timed out|timed out/i,
    hint: '計算がタイムアウトしました。期間・領域・解像度を小さくして分割するか、集計を簡素化してください。',
  },
  {
    test: /Parameter 'input' is required|Collection.first: .*empty|Empty date ranges|No bands in collection|Image.select: Pattern .* did not match any bands|Element.get: Parameter 'object' is required/i,
    hint: 'コレクションが空か、バンドが見つかりません。フィルタ条件（期間・領域・雲量）を緩める、bandNames() で実在するバンド名を確認する、などを試してください。',
  },
  {
    test: /did not match any bands|Band pattern|not found in image|Cannot find required band/i,
    hint: 'バンド名が一致しません。ee_describe または image.bandNames() で実在するバンド名を確認してください。',
  },
  {
    test: /Unrecognized argument type|Invalid argument|expected type/i,
    hint: '引数の型が不正です。EE API の引数名・型（ee.Geometry / ee.Date / 数値）を見直してください。',
  },
  {
    test: /not found|does not exist|Asset .* not found/i,
    hint: 'アセット ID が存在しないか、アクセス権がありません。データセット ID（例: COPERNICUS/S2_SR_HARMONIZED）を確認してください。',
  },
  {
    test: /not registered|not signed up|Not signed up for Earth Engine|Earth Engine API has not been used|PERMISSION_DENIED/i,
    hint: 'Earth Engine の利用登録が無いか、プロジェクトで Earth Engine API が有効化されていません。Cloud Console で API を有効化し、プロジェクトを EE に登録してください。',
  },
  {
    test: /401|UNAUTHENTICATED|invalid_token|Request had invalid authentication/i,
    hint: '認証トークンが無効または期限切れです。ヘッダーの GEE バッジから再ログインしてください。',
  },
  {
    test: /Geometry.*too many|Too many vertices|Geometry is too complex/i,
    hint: 'ジオメトリが複雑すぎます。simplify() で頂点を減らすか bounds() を使ってください。',
  },
  {
    // ツール実行中にサーバへ届かなくなった場合も、原因の切り分け方を示す。
    test: /Failed to contact Earth Engine servers/i,
    hint: 'EE サーバから応答がありませんでした（HTTP ステータス 0）。認証ではなく到達性の問題です。DevTools で window.__geeDiagnose() を実行すると、CSP・拡張機能・回線のどれで止まっているか切り分けられます。',
  },
]

export function normalizeEeError(error) {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  const hit = HINTS.find((h) => h.test.test(raw))
  return hit ? `${raw}\n\nヒント: ${hit.hint}` : raw
}

// 認証・初期化まわりのエラー文言に、設定の見直しポイントを添える（純関数・テスト対象）。
const AUTH_HINTS = [
  {
    // EE クライアントが XHR status 0 のときに返す文言。認証ではなく到達性の問題。
    test: /Failed to contact Earth Engine servers/i,
    hint: 'サーバから応答がありませんでした（HTTP ステータス 0 = レスポンス無し）。OAuth の「承認済みの JavaScript 生成元」ではなく、CSP の connect-src・ブラウザ拡張（広告ブロッカー等）・プロキシによる遮断が疑われます。続く「EE 接続診断」を確認するか、DevTools で window.__geeDiagnose() を実行してください。',
  },
  {
    test: /origin_mismatch|redirect_uri_mismatch|Not a valid origin|idpiframe_initialization_failed|invalid_request/i,
    hint: 'OAuth クライアント ID の「承認済みの JavaScript 生成元」に、このページのオリジン（例: http://localhost:5173）を追加してください。追加後、反映まで数分かかることがあります。',
  },
  {
    test: /invalid_client|The OAuth client was not found|unauthorized_client|deleted_client/i,
    hint: 'クライアント ID が間違っているか、削除されています。Cloud Console の「認証情報」で「ウェブ アプリケーション」のクライアント ID を確認してください。',
  },
  {
    test: /popup_closed|popup_blocked|Popup window closed|user_cancel|access_denied|interaction_required/i,
    hint: 'ログインのポップアップが閉じられた／ブロックされました。ポップアップを許可して、もう一度ボタンを押してください。',
  },
  {
    test: /not registered|not signed up|Not signed up for Earth Engine|has not been used in project|is not enabled|API has not been used|PERMISSION_DENIED|Earth Engine API/i,
    hint: 'プロジェクトが Earth Engine に未登録か、Earth Engine API が無効です。https://code.earthengine.google.com/register でプロジェクトを登録し、Cloud Console で Earth Engine API を有効化してください。',
  },
  {
    test: /project.*not found|Caller does not have required permission to use project|does not have permission/i,
    hint: 'プロジェクト ID が正しいか、ログインした Google アカウントにそのプロジェクトの権限があるか確認してください。',
  },
  {
    test: /Client ID が設定されていません|プロジェクト ID が設定されていません/,
    hint: '設定欄に入力してから実行してください。',
  },
]

export function describeGeeAuthError(error) {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  const hit = AUTH_HINTS.find((h) => h.test.test(raw))
  return hit ? `${raw}\n\nヒント: ${hit.hint}` : raw
}
