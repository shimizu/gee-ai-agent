// GEE ツールの定義（Claude へ渡す JSON スキーマ）。
//
// 役割: ee_run / ee_add_layer / ee_time_series / ee_describe の名前・説明・入力スキーマ。
//       実装は handlers.js。説明文はモデルの使い分け判断に直結するので具体的に書く。
const REGION_SCHEMA = {
  description:
    "領域指定。{type:'map_view'}（現在の地図表示範囲）/ {type:'point', lon, lat, buffer_m} / {type:'bbox', bounds:[west,south,east,north]} / {type:'geojson', geometry} / {type:'layer', layer_id}（ベクターレイヤーの形状）。",
  oneOf: [
    { type: 'object' },
    { type: 'array', items: { type: 'number' }, minItems: 4, maxItems: 4 },
    { type: 'string', enum: ['map_view'] },
  ],
}

export const EE_RUN = {
  name: 'ee_run',
  description:
    'Earth Engine JavaScript を実行して結果を返す。code は関数本体として実行され、`ee` と `ctx` が使える（await 可）。`return` した値が ee オブジェクト（ee.Number / ee.Dictionary / ee.List / ee.FeatureCollection など）なら evaluate してプレーン値にして返す。' +
    'reduceRegion の統計値・bandNames・size など「数値・小さな JSON」を得る用途に使う。大きな結果（FeatureCollection や長い配列）は save_as_dataset:true で Dataset Store に保存し、datasetId と要約だけを受け取る。' +
    'ctx.mapBounds() は現在の地図表示範囲の ee.Geometry、ctx.geometry はユーザーが指定した AOI（無ければ null）。',
  input_schema: {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description:
          "実行する EE JavaScript（関数本体）。例: const img = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED').filterDate('2024-06-01','2024-09-01').filterBounds(ctx.mapBounds()).median(); return img.reduceRegion({reducer: ee.Reducer.mean(), geometry: ctx.mapBounds(), scale: 100, maxPixels: 1e9, bestEffort: true});",
      },
      save_as_dataset: {
        type: 'boolean',
        description: '結果が行データ（FeatureCollection または オブジェクト配列）のとき Dataset Store に保存して datasetId を返す。',
      },
      title: { type: 'string', description: 'save_as_dataset のときのデータセット名。' },
    },
    required: ['code'],
  },
}

export const EE_ADD_LAYER = {
  name: 'ee_add_layer',
  description:
    'Earth Engine の画像を地図にレイヤーとして追加する。code は ee.Image（または ee.ImageCollection → 自動 mosaic）を return すること。' +
    "mode='png'（既定）: vis（bands/min/max/palette/gamma）で EE 側が可視化した 8bit タイル。真色合成やパレット表示に向く。" +
    "mode='raw': float の生データタイルをブラウザ側 GPU で着色。1 バンド（または band_math 用の 2 バンド）を rescale:[min,max] と colormap（viridis, magma, rdylgn, terrain, blues, …）で描画し、ホバーで実ピクセル値を表示できる。カラーマップ・レンジの変更が再計算なしで即時反映される。NDVI 等の指標・標高・気温など単バンドの連続値に向く。" +
    '戻り値は layerId と bandNames。同名レイヤーが既にあれば置き換える。',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'レイヤー名（日本語可）。' },
      code: { type: 'string', description: 'ee.Image を return する EE JavaScript（関数本体）。' },
      mode: { type: 'string', enum: ['png', 'raw'], description: '既定 png。' },
      vis: {
        type: 'object',
        description: "png 用の可視化パラメータ。例 {bands:['B4','B3','B2'], min:0, max:3000} / {min:-0.2, max:0.8, palette:['brown','yellow','green']}",
        properties: {
          bands: { type: 'array', items: { type: 'string' } },
          min: { oneOf: [{ type: 'number' }, { type: 'array', items: { type: 'number' } }] },
          max: { oneOf: [{ type: 'number' }, { type: 'array', items: { type: 'number' } }] },
          palette: { type: 'array', items: { type: 'string' } },
          gamma: { type: 'number' },
          opacity: { type: 'number' },
        },
      },
      bands: {
        type: 'array',
        items: { type: 'string' },
        description: 'raw 用に配信するバンド（最大 4。省略時は先頭 1 バンド、band_math 指定時は先頭 2 バンド）。',
      },
      rescale: {
        type: 'array',
        items: { type: 'number' },
        minItems: 2,
        maxItems: 2,
        description: 'raw 用の表示レンジ [min, max]。この範囲をカラーマップに割り当てる。',
      },
      colormap: { type: 'string', description: 'raw 用カラーマップ名（matplotlib 名。既定 viridis）。' },
      colormap_reversed: { type: 'boolean' },
      band_math: {
        type: 'string',
        enum: ['normalized_difference', 'ratio', 'difference', 'log10'],
        description: 'raw 用の GPU バンド演算。normalized_difference は (band1 - band2)/(band1 + band2)。bands に 2 バンドを順に指定する。',
      },
      opacity: { type: 'number', minimum: 0, maximum: 1, description: 'レイヤー不透明度（既定 1）。' },
      fit_bounds: {
        description: '追加後にズームする範囲。[west,south,east,north] か region 形式。',
        oneOf: [{ type: 'array', items: { type: 'number' } }, { type: 'object' }, { type: 'string' }],
      },
    },
    required: ['name', 'code'],
  },
}

export const EE_TIME_SERIES = {
  name: 'ee_time_series',
  description:
    'ImageCollection を領域で集約した時系列を作り、Dataset Store に保存して datasetId を返す（チャート化は show_chart）。' +
    'collection_code は ee.ImageCollection を return する EE JavaScript（フィルタ・前処理・select・map 済みで良い）。各画像を region で reducer 集約し、date（YYYY-MM-dd）+ バンド値の行にする。' +
    '画像数が多いと遅いので、月合成（例: 月ごとに median）や max_images で抑える。',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'データセット名。' },
      collection_code: { type: 'string', description: 'ee.ImageCollection を return する EE JavaScript。' },
      region: REGION_SCHEMA,
      reducer: {
        type: 'string',
        enum: ['mean', 'median', 'min', 'max', 'sum', 'stdDev', 'count'],
        description: '既定 mean。',
      },
      scale: { type: 'number', description: '集約の解像度（m）。データセットのネイティブ解像度か、やや粗め（既定 500）。' },
      bands: { type: 'array', items: { type: 'string' }, description: '集約するバンド（省略時は全バンド）。' },
      max_images: { type: 'integer', minimum: 1, maximum: 2000, description: '処理する最大画像数（既定 500）。' },
      date_format: { type: 'string', description: "日付の書式（既定 'YYYY-MM-dd'。月次なら 'YYYY-MM'）。" },
    },
    required: ['name', 'collection_code', 'region'],
  },
}

export const EE_DESCRIBE = {
  name: 'ee_describe',
  description:
    'code の戻り値（ee.Image / ee.ImageCollection / ee.FeatureCollection / その他）の構造を小さく確認する。Image はバンド名と解像度、ImageCollection は件数・期間・先頭画像のバンド、FeatureCollection は件数と列名。コードを書く前のデータ確認に使う。',
  input_schema: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'EE オブジェクトを return する EE JavaScript。' },
    },
    required: ['code'],
  },
}
