// チャート・データセットツールの定義。
import { CHART_TYPES } from '../../data/chart-spec.js'
import { SUPPORTED_OPERATIONS } from '../portwatch/metrics.js'

export const SHOW_CHART = {
  name: 'show_chart',
  description:
    'チャートをチャットに表示する（クリックで拡大）。データは dataset_id（推奨）か data（行配列、小さいときだけ）で渡す。' +
    "type: line / area（時系列）, bar（カテゴリ比較）, scatter（2 変数の関係）, histogram（x 列の分布）。x は横軸の列、series は縦軸の列（最大 6）。xType は time / category / number（省略時は推定）。",
  input_schema: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: CHART_TYPES },
      title: { type: 'string' },
      dataset_id: { type: 'string' },
      data: { type: 'array', items: { type: 'object' }, description: '行配列（dataset_id が無いときのみ。200 行以下推奨）' },
      x: { type: 'string', description: '横軸の列名（histogram では分布を取る列）' },
      xType: { type: 'string', enum: ['time', 'category', 'number'] },
      y: { type: 'string', description: '縦軸の列名（1 系列のとき）' },
      series: {
        type: 'array',
        items: {
          type: 'object',
          properties: { key: { type: 'string' }, label: { type: 'string' }, color: { type: 'string' } },
          required: ['key'],
        },
        description: '複数系列 [{key, label?, color?}]',
      },
      yLabel: { type: 'string' },
      unit: { type: 'string' },
      stacked: { type: 'boolean' },
      bins: { type: 'integer', minimum: 2, maximum: 100 },
      referenceLines: { type: 'array', items: { type: 'object', properties: { y: { type: 'number' }, label: { type: 'string' } } } },
      note: { type: 'string', description: 'チャート下に出す短い注記（推計値である旨など）' },
      source: { type: 'string', description: '出典（例: IMF PortWatch / MODIS MOD13Q1）' },
    },
    required: ['type', 'x'],
  },
}

export const LIST_DATASETS = {
  name: 'list_datasets',
  description: 'Dataset Store のデータセット一覧（id・タイトル・件数・列・期間）を返す。',
  input_schema: { type: 'object', properties: {} },
}

export const INSPECT_DATASET = {
  name: 'inspect_dataset',
  description: 'データセットの列・件数・期間・サンプル行・指定列の distinct 値を確認する。数値の根拠にはせず構造確認に使う。',
  input_schema: {
    type: 'object',
    properties: {
      dataset_id: { type: 'string' },
      sample_size: { type: 'integer', minimum: 0, maximum: 20 },
      distinct_column: { type: 'string' },
    },
    required: ['dataset_id'],
  },
}

export const ANALYZE_DATASET = {
  name: 'analyze_dataset',
  description:
    'データセットの数値列を決定論的に分析する。summary（件数・最新・平均・最小最大・標準偏差・合計）、trend / anomaly（日次データ向け: 28 日平滑＋年間 Z スコアで現在水準・前月比・σ・シグナル）。数値を回答する前に必ず使い、サンプル行から推測しない。',
  input_schema: {
    type: 'object',
    properties: {
      dataset_id: { type: 'string' },
      operation: { type: 'string', enum: SUPPORTED_OPERATIONS },
      column: { type: 'string', description: '対象列（省略時は全数値列）' },
      date_column: { type: 'string', description: 'trend/anomaly の日付列（既定 date）' },
    },
    required: ['dataset_id', 'operation'],
  },
}
