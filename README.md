# gee-ai-agent — Earth Engine AI エージェント

自然言語で指示すると、AI エージェント（Claude）が **Google Earth Engine** のコードを書いて実行し、結果を
**地図レイヤー**（deck.gl + deck.gl-raster）と**チャート**（チャット内カード・クリックで拡大）で返す、
ブラウザ完結型の分析アプリです。**IMF PortWatch** の港湾データ（入港数・貿易量・波及リスク・災害）も扱え、
港の情報と衛星データを組み合わせた分析ができます。

## 特徴
- 🤖 日本語で指示 → エージェントが `ee.*` コードを書き、地図・数値・時系列に
- 🗺️ **png モード**（EE 側で可視化した 8bit タイル）と **raw モード**（float 生データタイルを GPU で着色。
  ホバーで実値表示、カラーマップ/レンジの即時変更、バンド演算）
- 📈 時系列・集計をデータセットに保存し、`show_chart` でチャット内にチャート
- ⚓ PortWatch: 港・要衝の検索、日次入港数/貿易量、波及リスク、災害イベント、港の位置レイヤー
- 🎙 音声で相談（Gemini Live）: マイクで話すと Gemini が指示文を作って Claude に**送信・実行まで**行い、完了を音声で要約
- 💾 エクスポート: レイヤーを GeoTIFF（EE から生データ、または表示中の float タイルをクライアントで結合）/ PNG、ベクターを GeoJSON、データセットを CSV/JSON/GeoJSON で保存。エージェントにも「GeoTIFF にして」と頼める
- 🔌 データソースは `src/tools/<source>/` + `src/agent/skills/<source>.js` を足すだけで拡張可能

## セットアップ

```bash
npm install
npm run dev      # http://localhost:5173
```

### 必要な設定（画面右上 ⚙ 設定）
1. **Claude API キー**（platform.claude.com）
   - 任意: **Gemini API キー**（Google AI Studio）を入れると「🎙 音声で相談」が使えます（専用キー + 利用上限推奨）
2. **GEE OAuth クライアント ID** と **Cloud プロジェクト ID**
   - Google Cloud Console → API とサービス → 認証情報 → OAuth 2.0 クライアント ID（**ウェブ アプリケーション**）
   - 「承認済みの JavaScript 生成元」に `http://localhost:5173`（および本番オリジン）を追加。リダイレクト URI は不要
   - プロジェクトを Earth Engine に登録し、Earth Engine API を有効化
3. 保存後、ヘッダーの **「GEE ログイン」** を押して Google アカウントで認証（トークンは約 1 時間で失効）

PortWatch だけの質問（例: 「シンガポール港の入港数推移をグラフに」）は GEE ログイン無しでも動きます。

## 使い方の例
- 「東京湾周辺の 2024 年夏の Sentinel-2 真色画像を表示して」
- 「今の表示範囲で 2024 年 5〜9 月の NDVI 中央値を raw モードで表示して」
- 「この範囲の平均標高と最大標高を教えて」
- 「この地点の 2023 年 MODIS NDVI 月別推移をグラフにして」
- 「シンガポール港周辺 10km の夜間光の月次推移と入港数を比べて」

## コマンド
| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー |
| `npm run build` / `npm run preview` | 本番ビルド（CSP 注入）/ プレビュー |
| `npm run lint` | ESLint（警告ゼロ） |
| `npm test` | `node --test`（純ロジック） |
| `npm run deploy` | gh-pages へデプロイ |

## 技術スタック
React 19 / Vite 8 / deck.gl 9.3 + `@developmentseed/deck.gl-raster` / MapLibre GL（CARTO ベースマップ）/
`@google/earthengine`（ブラウザ OAuth）/ geotiff.js / Recharts / Claude Messages API 直叩き / `@google/genai`（Gemini Live）。

## 開発メモ
- raw タイル配信の実機確認: GEE ログイン後、DevTools で `await window.__geeSpike()`（`docs/spike-raw-tiles.md`）。
- GEE 無しで raw パイプラインを見る: `window.__geeDev.addSyntheticRawLayer()`。
- 設計・規約は `CLAUDE.md` / `AGENTS.md`。
