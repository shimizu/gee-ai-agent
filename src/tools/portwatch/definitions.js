// PortWatch ツールの定義。
export const PW_SEARCH = {
  name: 'portwatch_search_locations',
  description:
    'IMF PortWatch の港・チョークポイント（海上要衝）を名称や国名で検索し、portid・scope・座標（lat/lon）を特定する。PortWatch データ取得の最初に使う。取扱量（年間入港隻数）の多い順。',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '港名・要衝名・国名の一部（例: Singapore, Suez, Japan）。' },
      scope: { type: 'string', enum: ['port', 'chokepoint', 'any'], description: '既定 any。' },
      limit: { type: 'integer', minimum: 1, maximum: 50 },
    },
  },
}

export const PW_FETCH_METRICS = {
  name: 'portwatch_fetch_metrics',
  description:
    '指定 portid の日次時系列を取得して Dataset Store に保存し datasetId を返す。港（scope=port）は portcalls / import / export、チョークポイントは n_total / capacity（import/export/capacity は推計トン）。',
  input_schema: {
    type: 'object',
    properties: {
      portid: { type: 'string', description: 'portwatch_search_locations が返した portid。' },
      scope: { type: 'string', enum: ['port', 'chokepoint'] },
      days: { type: 'integer', minimum: 1, maximum: 1000, description: '直近日数（既定 365、最大 1000）。' },
    },
    required: ['portid', 'scope'],
  },
}

export const PW_FETCH_SPILLOVERS = {
  name: 'portwatch_fetch_spillovers',
  description:
    '指定した港が混乱した場合の波及リスク（Spillover Simulator）を上位件数で取得する。kind=trade は国別の貿易リスク額（USD/日, 業種別）、kind=port は影響先の港の輸送能力リスク（トン/日, 平均通過日数・座標つき）。港のみ対象。値はモデル推計。',
  input_schema: {
    type: 'object',
    properties: {
      portid: { type: 'string' },
      kind: { type: 'string', enum: ['trade', 'port'], description: '既定 trade。' },
      industry: { type: 'string', description: "kind=trade の業種。既定 'Total'。" },
      by: { type: 'string', enum: ['export', 'import'] },
      limit: { type: 'integer', minimum: 1, maximum: 50 },
      save_as_dataset: { type: 'boolean', description: '結果を Dataset Store に保存する（チャート化・地図化に使う）。' },
    },
    required: ['portid'],
  },
}

export const PW_FIND_DISRUPTIONS = {
  name: 'portwatch_find_disruptions',
  description:
    '港に影響した災害イベント（GDACS 赤アラート × 港湾境界: 地震 EQ / 熱帯低気圧 TC / 洪水 FL / 火山 VO / 干ばつ DR / 山火事 WF / その他 OT）を検索する。名称・国・種別・開始日で絞れる。被災港名・座標・影響人口つき。',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'イベント名・港名・国名の一部' },
      event_type: { type: 'string', enum: ['EQ', 'TC', 'FL', 'VO', 'DR', 'WF', 'OT'] },
      country: { type: 'string' },
      since: { type: 'string', description: 'YYYY-MM-DD 以降' },
      limit: { type: 'integer', minimum: 1, maximum: 100 },
      save_as_dataset: { type: 'boolean' },
    },
  },
}

export const PW_SHOW_LOCATIONS = {
  name: 'portwatch_show_locations',
  description: '港・チョークポイントの位置を点レイヤーとして地図に追加する。portids（推奨）か query で指定。',
  input_schema: {
    type: 'object',
    properties: {
      portids: { type: 'array', items: { type: 'string' } },
      scope: { type: 'string', enum: ['port', 'chokepoint'], description: 'portids 指定時の種別（既定 port）。' },
      query: { type: 'string', description: 'portids が無いときの検索語。' },
      name: { type: 'string', description: 'レイヤー名（既定 "PortWatch 港"）。' },
      limit: { type: 'integer', minimum: 1, maximum: 50 },
      fit_bounds: { type: 'boolean' },
    },
  },
}
