# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

自然言語で指示すると AI エージェント（Claude）が **Google Earth Engine (GEE)** の JavaScript を書いて実行し、
結果を**地図レイヤー（deck.gl + deck.gl-raster）**と**チャート（チャット内カード）**で返す、
**ブラウザ完結型の分析エージェント**。バックエンドを持たず、Claude API・Earth Engine・IMF PortWatch（ArcGIS）を
ブラウザから直接呼ぶ。API キー・OAuth クライアント ID は画面で入力し localStorage に保存する。

主な機能: EE 画像の地図表示（png = EE 側可視化 / raw = float 生データを GPU で着色・ホバーで実値・
カラーマップ即時変更）、EE の値計算・時系列集約、チャート出力、IMF PortWatch（港の検索・日次入港数・
波及リスク・災害イベント・港の位置表示）、港 × 衛星の複合分析。

## コマンド

```bash
npm install        # 依存インストール（Node 20+。~/.npmrc の min-release-age に注意）
npm run dev        # Vite 開発サーバー（http://localhost:5173）
npm run build      # 本番ビルド（dist/）。CSP meta を注入する
npm run preview    # ビルド結果のプレビュー
npm run lint       # ESLint（--max-warnings 0）
npm test           # node --test（ブラウザ非依存の純ロジックのみ）
```

テストは Node 標準の `node --test`。ブラウザ依存（EE ライブラリ / WebGL / DOM）に触れない純ロジックだけを
対象にする（chart-spec / tms / pixel-pick / raster-texture / ee-errors / code-runner / region /
portwatch-client / metrics / dataset-store / layer-store / system-prompt / runtime / tool-registry）。
描画・認証は `npm run dev` での手動確認で担保する。

## GEE の前提（利用者側の設定）
- Google Cloud Console で **OAuth 2.0 クライアント ID（ウェブ アプリケーション）** を作り、
  **承認済みの JavaScript 生成元**に `http://localhost:5173` と本番オリジンを登録する（リダイレクト URI 不要）。
- プロジェクトは Earth Engine に登録済みで Earth Engine API が有効であること。
- ⚙ 設定にクライアント ID とプロジェクト ID を入れ、ヘッダーの「GEE ログイン」で認証する
  （`ee.data.authenticateViaOauth` → GIS ポップアップ → `ee.initialize(..., project)`）。トークンは約 1 時間で失効し、
  バッジが「期限切れ」になったら再ログインする。

## アーキテクチャ

### レイヤ分離（最重要）
`src/components/` は**表示と入力のみ**。推論・EE 実行・データ管理は `src/agent/`・`src/tools/`・`src/gee/`・`src/data/`
のプレーン JS が行う。**コンポーネントに API 呼び出しや EE コードを直書きしない。** `src/App.jsx` が唯一の結線点で、
`src/hooks/` の結線フックを依存順に組み立てる。

### 結線フック層（`src/hooks/`）
- `useSettings` — API キー・モデル・GEE クライアント ID/プロジェクトの state と localStorage。
- `useGeeClient` — `GeeClient`（`src/gee/ee-client.js`）の単一インスタンスを購読。login/logout。
- `useLayerActions` — `LayerStore` を所有。`addRasterLayer`（spec → `gee/layer-factory` で runtime 作成）、
  `addVectorLayer`、削除/更新/再作成、GEE ready 後の復元。
- `useDatasetActions` / `useChartActions` — `DatasetStore` / `ChartStore` の所有と購読、拡大ダイアログの開閉。
- `useAgentSession` — チャット状態と `ConversationStore`、`runAgent` への `callClaude` / `toolRegistry` / system の注入。
  system は「安定プレフィックス（BASE+スキル, cache_control）」+「揮発ブロック（GEE 状態・レイヤー・データセット・表示範囲）」。
  ツールからの `postChatMessage({kind:'chart'})` もここで受ける。
- `useMapHover` — raw レイヤーのホバーでタイルキャッシュから実値を拾う。

### GEE 層（`src/gee/`）
- `ee-loader.js` — `@google/earthengine` の動的 import と GIS スクリプト先読み（ポップアップブロック対策）。
- `ee-client.js` — 認証・初期化ステートマシン（idle/loading-lib/authenticating/initializing/ready/expired/error）。
- `code-runner.js` — エージェントの EE JS を `new Function('ee','ctx', ...)` で実行（Code Editor 流）。禁止 API の
  ブラックリスト、タイムアウト、`resolveResult`（ee オブジェクトは evaluate）。
- `map-service.js` — `createPngMap`（`applyVisualization` + `getMapId`）/ `createRawMap`（`getMapId({format:'GEO_TIFF', bands})`。
  JS クライアントは `params.format` を `ee.rpc_convert.fileFormat` で変換し、vis 無しなら visualizationOptions は null）。
  raw は `select(bands).toFloat().unmask(RAW_NODATA)` で番兵値を埋める。
- `raw-tile.js` / `raster-texture.js` — タイル fetch → geotiff.js 復号 → `packBands`（1 band=r32float、2–4=rgba32float）→ luma.gl テクスチャ。
- `tms.js` — WebMercatorQuad の TMS JSON を生成し `TileMatrixSetAdaptor` に渡す（EE の z/x/y と 1:1）。
- `pipeline.js` — `[CreateTexture, FilterNoDataVal?, BAND_MATH?, LinearRescale, Colormap?, SetAlpha1]`。band math は事前定義のみ。
- `colormap-registry.js` — `colormaps.png` → `decodeColormapSprite` → `createColormapTexture(device)`（device ごとにメモ化）。
- `tile-cache.js` / `pixel-pick.js` — CPU 側 Float32Array のキャッシュと経緯度→画素参照（表示ズーム+2 から降順に探す）。
- `layer-factory.js` — spec → runtime。raw の `getTileData` はここで 1 回だけ作る（参照安定が必須）。
- `export-service.js` — EE 経由のエクスポート（`getDownloadURL`/`getThumbURL` の Promise 化、`buildDownloadParams`、
  `estimateDownloadBytes`: 1 リクエスト ≒48MB 上限の事前推定と scale 提案）。
- `tile-mosaic.js` — 表示中の raw タイルをクライアントで結合し geotiff.js `writeArrayBuffer` で EPSG:3857 の float32 GeoTIFF に
  書き出す（`tileRangeForBounds` / `mosaicTiles` / `mercatorGeoTransform` / `writeGeoTiff3857` / `exportRawLayerTiles`、上限 64 タイル）。
- `spike.js` — 開発専用。`window.__geeSpike()`（raw タイル配信の実機確認）と `window.__geeDev`（ストア・合成 raw レイヤー）。

### ツール層（`src/tools/`）— 拡張ポイント
各ソースは `src/tools/<source>/index.js` で `{ id, skills: [Markdown...], register(registry, deps) }` を export し、
`src/tools/sources.js` の `SOURCES` に 1 行足すだけでツール登録とシステムプロンプトの両方に反映される。
- `gee/`: `ee_run` / `ee_add_layer` / `ee_time_series` / `ee_describe`
- `map/`: `list_layers` / `remove_layer` / `update_layer_style` / `get_map_view` / `fit_bounds` / `add_vector_layer` / `export_layer`（EE の
  ダウンロード URL を返す。48MB 超過見込みは実行せず suggestedScale 付きエラー）
- `chart/`: `show_chart` / `list_datasets` / `inspect_dataset` / `analyze_dataset`
- `portwatch/`: `portwatch_search_locations` / `portwatch_fetch_metrics` / `portwatch_fetch_spillovers` /
  `portwatch_find_disruptions` / `portwatch_show_locations`（+ `portwatch-client.js` / `anomaly.js` / `metrics.js`）
- `shared/`: `summarize.js`（LLM へ返す要約・GeoJSON 変換）、`region.js`（領域指定の正規化 → ee.Geometry）
deps の形は `src/tools/register-tools.js` 先頭のコメント参照。**ツールは要約だけを LLM に返す**（行データは DatasetStore、
地物は LayerStore）。

### エージェント層（`src/agent/`）— web-gis-ai-agent のパターンを踏襲
`runtime.js`（tool use ループ、`is_error` で自己修正、`TOOL_RESULT_CHAR_CAP`）、`claude-client.js`（直叩き・リトライ・
プロンプトキャッシュ）、`tool-registry.js`、`compaction.js`、`conversation-store.js`、`system-prompt.js` + `skills/`
（`gee-core` / `gee-viz` / `chart` / `portwatch` / `portwatch-x-gee`。1 ドメイン 1 ファイルの Markdown 文字列）。

### データ層（`src/data/`）
`layer-store.js`（spec のみ永続化。runtime はリロード後に再作成）、`dataset-store.js`（要約 localStorage + 行 IndexedDB）、
`chart-store.js`、`chart-spec.js`（show_chart 入力の検証・正規化・ヒストグラム）、`idb.js`、`settings.js`、
`export-formats.js`（データセット CSV/JSON/GeoJSON・ベクター GeoJSON・`safeFilename`）。

### エクスポート UI
レイヤー行の ⤓: EE ラスターは `ExportLayerModal`（「EE からダウンロード」= 範囲/scale/CRS/バンド/形式 + 推定サイズ、
「表示タイルから」= raw のみ、ズーム指定）、ベクターは GeoJSON 即保存。データセット行の CSV/JSON/GeoJSON ボタン。

### 描画（`src/Layers/index.js`）
deck.gl レイヤー配列を組む唯一の場所。png = `TileLayer`+`BitmapLayer`、raw = `RasterTileLayer`（`updateTriggers.renderTile`
に colormap/rescale 等を入れて再フェッチ無しで再描画）、vector = `GeoJsonLayer`。MapLibre の interleaved モードで
`beforeId`（最初の symbol レイヤー）の下に敷く。

## 守るべき前提
- raw の `getTileData` は参照安定にする（変わると全タイル再取得）。spec の変更は `layerStore.updateSpec` で。
- raw のマスク画素は `RAW_NODATA`（-999999）で埋め、GPU は `FilterNoDataVal`、ホバーは「なし」。
- `ee.Reducer` 等の動的クラスは `ee.initialize` 後にしか無い。ツールは必ず `geeClient.assertReady()` を通す。
- `@google/earthengine`（Closure ビルド）は `ee.initialize` 内で `goog.global.ee`（= `window.ee`）を参照する。`ee-loader.js` が
  import 後に `window.ee = ee` を設定している（無いと "Cannot use 'in' operator to search for 'Classifier' in undefined"）。
- `login()` はクリックハンドラから同期的に呼ぶ（GIS のポップアップ）。設定保存時に `preload()` で GIS を先読み。
- CSP（vite.config.js）は `'unsafe-eval'` 必須（`new Function`）。外部ホストを増やしたら connect-src/img-src も更新。
- `localStorage` キーは `gee-agent.*`。「新しい会話」で会話・レイヤー・データセット・チャート・ログを全消去。
- deck.gl-raster は 0.8.0-beta.2 に固定。依存箇所は `Layers/index.js` と `gee/pipeline.js` / `gee/tms.js` に閉じ込める。

## 参考資料
`reference/`（lint/test 対象外・import 禁止）: `web-gis-ai-agent`（agent コアと UI の流用元）、`portwatch-dashboard`
（PortWatch クライアントと docs/portwatch-api.md）、`deck.gl-raster`（ライブラリのソースと examples）。

## コミット規約
プレフィックスを付ける: `feat:` / `fix:` / `docs:` / `refactor:` / `perf:` / `test:` / `chore:` / `style:`。
