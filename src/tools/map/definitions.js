// 地図・レイヤー操作ツールの定義。
export const LIST_LAYERS = {
  name: 'list_layers',
  description: '地図上のレイヤー一覧（layerId・名前・種別・モード・バンド・表示状態・スタイル）を返す。',
  input_schema: { type: 'object', properties: {} },
}

export const REMOVE_LAYER = {
  name: 'remove_layer',
  description: '指定した layer_id のレイヤーを地図から削除する。',
  input_schema: {
    type: 'object',
    properties: { layer_id: { type: 'string' } },
    required: ['layer_id'],
  },
}

export const UPDATE_LAYER_STYLE = {
  name: 'update_layer_style',
  description:
    'レイヤーの表示を変更する。全レイヤー: opacity / visible / name。raw レイヤー: colormap / colormap_reversed / rescale（再計算なしで即時反映）。png レイヤーの vis 変更は ee_add_layer を同名で呼び直す。ベクター: color（[r,g,b]）/ radius。',
  input_schema: {
    type: 'object',
    properties: {
      layer_id: { type: 'string' },
      opacity: { type: 'number', minimum: 0, maximum: 1 },
      visible: { type: 'boolean' },
      name: { type: 'string' },
      colormap: { type: 'string' },
      colormap_reversed: { type: 'boolean' },
      rescale: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
      color: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 },
      radius: { type: 'number' },
    },
    required: ['layer_id'],
  },
}

export const GET_MAP_VIEW = {
  name: 'get_map_view',
  description: '現在の地図表示範囲 bounds [west,south,east,north]・中心・ズームを返す。',
  input_schema: { type: 'object', properties: {} },
}

export const FIT_BOUNDS = {
  name: 'fit_bounds',
  description: '地図を指定範囲にズームする。bounds [west,south,east,north]、または layer_id / dataset_id（lon/lat 列を持つもの）の範囲。',
  input_schema: {
    type: 'object',
    properties: {
      bounds: { type: 'array', items: { type: 'number' }, minItems: 4, maxItems: 4 },
      layer_id: { type: 'string' },
      dataset_id: { type: 'string' },
    },
  },
}

export const ADD_VECTOR_LAYER = {
  name: 'add_vector_layer',
  description:
    'GeoJSON、または lon/lat 列を持つデータセットの行から点・線・面のベクターレイヤーを地図に追加する（例: 港の位置、EE の FeatureCollection 結果）。geojson は 2000 地物まで。',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      geojson: { type: 'object', description: 'GeoJSON FeatureCollection / Feature / Geometry。' },
      dataset_id: { type: 'string', description: 'Dataset Store のデータセット（lon/lat 列、または ee_run の FeatureCollection 結果）。' },
      lon_col: { type: 'string', description: '既定 lon' },
      lat_col: { type: 'string', description: '既定 lat' },
      color: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: '[r,g,b] 0-255' },
      radius: { type: 'number', description: '点の半径（px。既定 6）' },
      fit_bounds: { type: 'boolean', description: '追加後にズームする（既定 true）' },
    },
    required: ['name'],
  },
}

export const EXPORT_LAYER = {
  name: 'export_layer',
  description:
    'EE ラスターレイヤーを GeoTIFF（可視化前の生データ・元のデータ型）または PNG（レイヤーの vis で可視化）としてダウンロードする URL を作る。' +
    'Earth Engine 側で指定範囲・解像度・CRS に再計算するため、1 回の上限は約 48MB（超過見込みなら実行せず suggestedScale を返すので scale を粗くして再試行）。' +
    '返った url を最終回答に Markdown リンクで載せてユーザーに案内する（URL は一時的）。ベクターレイヤーやデータセットはパネルのボタンから保存する。',
  input_schema: {
    type: 'object',
    properties: {
      layer_id: { type: 'string' },
      region: {
        description: "範囲。既定は現在の地図表示範囲（{type:'map_view'}）。[west,south,east,north] / {type:'bbox', bounds} / {type:'point', lon, lat, buffer_m} / {type:'layer', layer_id} も可。",
        oneOf: [{ type: 'object' }, { type: 'array', items: { type: 'number' } }, { type: 'string' }],
      },
      scale: { type: 'number', description: '解像度（m）。既定 100。データのネイティブ解像度以上を推奨。' },
      crs: { type: 'string', enum: ['EPSG:4326', 'EPSG:3857'], description: '既定 EPSG:4326' },
      bands: { type: 'array', items: { type: 'string' }, description: '書き出すバンド（省略時は全バンド）' },
      format: { type: 'string', enum: ['geotiff', 'png'], description: '既定 geotiff' },
    },
    required: ['layer_id'],
  },
}
