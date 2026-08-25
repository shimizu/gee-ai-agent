// コーヒー監視ツールの定義。
export const COFFEE_LIST_MONITORS = {
  name: 'coffee_list_monitors',
  description:
    'コーヒー生産リスクの監視カレンダー（主要産地 × 月 × 生育段階 × リスク種別 × 優先度）から、指定月にアクティブな監視ジョブを返す（省略時は現在月）。' +
    '各ジョブに対象産地の region（{type:"bbox", bounds:[w,s,e,n]} — ee_time_series の region や ee_run の ee.Geometry.Rectangle にそのまま使える）と、' +
    'リスク種別ごとの推奨データセット・指標・判定閾値（profiles）を付ける。コーヒー関連の分析（今月の監視対象・ブラジルの霜リスク・ベトナムの干ばつ など）の最初に使う。EE は呼ばない。',
  input_schema: {
    type: 'object',
    properties: {
      month: { type: 'integer', minimum: 1, maximum: 12, description: '月（1〜12）。省略時は現在月。' },
      country: {
        type: 'string',
        description: '国名または産地名の一部（Brazil / Vietnam / Colombia / Indonesia / Central America / Honduras / Dak Lak など。大文字小文字不問）。国で絞るときは国名で指定する。',
      },
      risk: { type: 'string', enum: ['drought', 'frost', 'excess_rain', 'storm', 'structural'], description: 'リスク種別で絞る。' },
      include_profiles: { type: 'boolean', description: 'リスク種別ごとのデータセット・閾値（profiles）を含める（既定 true）。' },
    },
  },
}

export const COFFEE_SHOW_REGIONS = {
  name: 'coffee_show_regions',
  description:
    'コーヒー主要産地（概略 bbox）をポリゴンのベクターレイヤーとして地図に追加する。region_ids（coffee_list_monitors が返す産地 ID）か country で絞る。省略時は全産地。GEE ログイン不要。',
  input_schema: {
    type: 'object',
    properties: {
      region_ids: { type: 'array', items: { type: 'string' }, description: '産地 ID（例 BR_SUL_MINAS）。' },
      country: { type: 'string', description: '国名の一部（Brazil など）。region_ids が無いときに使う。' },
      name: { type: 'string', description: 'レイヤー名（既定「コーヒー産地」）。' },
      color: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: '[r,g,b] 0-255（既定 [111,78,55]）。' },
      fit_bounds: { type: 'boolean', description: '追加後に範囲へ移動する（既定 true）。' },
    },
  },
}
