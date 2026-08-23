# スパイク: raw（float GeoTIFF）タイル配信の確認

## 目的
Earth Engine の `maps.create`（JS クライアントでは `ee.data.getMapId({ image, format: 'GEO_TIFF', bands })`）が
`/v1/{name}/tiles/{z}/{x}/{y}` で float 生データタイルを返し、ブラウザで geotiff.js 復号 → luma.gl float テクスチャ →
deck.gl-raster の GPU パイプラインに載ることを確認する。

## 実装上の根拠（コードリーディングで確認済み）
- `ee.data.getMapId` は `fileFormat: ee.rpc_convert.fileFormat(params.format)` を `EarthEngineMap` に設定する。
  `rpc_convert.fileFormat('GEO_TIFF')` は `'GEO_TIFF'` をそのまま返す（`'geotiff'` / `'tif'` も可）。
- `rpc_convert.visualizationOptions(params)` は min/max/palette/gamma/gain/bias が無ければ **null** を返す
  → 生値がそのまま配信される。
- deck.gl-raster は `RenderTileResult.renderPipeline` に `CreateTexture` で任意の luma.gl Texture（r32float /
  rgba32float）を渡せる。

## 手順（GEE ログイン後、DevTools で）
```js
await window.__geeSpike()            // 既定: SRTM elevation, z=8 x=227 y=100（関東）
await window.__geeSpike({ z: 6, x: 56, y: 25 })
```
コンソールに `urlFormat`・HTTP ステータス・Content-Type・復号結果（width/height/bands/nodataTag/min/max/nodataPixels）
と、png 側の CORS 確認が出る。

## 結果（2026-08-24 実機）
- `ee.data.getMapId({image, format:'GEO_TIFF'})` のタイルは **Uint8（sf=1, bits=8）、値 0/255** だった（既定可視化 [0,1] で飽和）。
  つまり maps エンドポイントは fileFormat に関わらず可視化を通す → 方式 A/B は不採用。
- 本番は **方式 C: `image:computePixels`**（`src/gee/raw-tile.js` `fetchComputePixelsTile`、grid は `tms.tileAffineTransform`）。
  float32 GeoTIFF（sf=3）が返り、ホバー実値・GPU カラーマップが機能する。
- 診断: レイヤー追加後にログの `raw タイル診断 …` 行で bands/型/値域を確認できる。`window.__geeSpike()` も computePixels の結果を出す。

## 確認したいこと（記録欄・当初）
| 項目 | 期待 | 結果 |
|---|---|---|
| raw の HTTP ステータス / Content-Type | 200 / image/tiff | （未実施） |
| geotiff.js 復号 | 256×256, 1 band Float32 | （未実施） |
| nodata の表現 | `unmask(-999999)` の番兵値が画素に入る | （未実施） |
| png タイルの CORS（fetch） | `Access-Control-Allow-Origin` あり | （未実施） |
| 認証ヘッダの要否 | 不要（mapid が署名代わり）。401/403 なら `Authorization` 付きで再試行 | （未実施） |

## 代替経路（方式 A が使えない場合）
1. REST `POST https://earthengine.googleapis.com/v1/projects/{project}/maps` を `fetch` 直叩き
   （`Authorization: ee.data.getAuthToken()`、body `{expression: ee.Serializer.encodeCloudApiExpression(image), fileFormat:'GEO_TIFF', bandIds}`）。
2. タイルごとに REST `image:computePixels`（`grid: {dimensions:{width:256,height:256}, affineTransform, crsCode:'EPSG:3857'}`、
   `fileFormat:'GEO_TIFF'`）を `RasterTileLayer.getTileData` から呼ぶ（遅いが確実）。
切替は `src/gee/map-service.js` の `createRawMap` と `src/gee/layer-factory.js` の `getTileData` に閉じている。
