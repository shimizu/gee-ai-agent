// コーヒー生産リスク監視スキル。
// 役割: 「監視カレンダー × 産地 × Earth Engine」でコーヒー産地の気象異常を平年比較で検知する手順・データセットの使い分け・
//       判定ルール・注意をエージェントに与える。カレンダー表・産地表・判定ルールは tools/coffee/ のデータから生成する（単一情報源）。
//       gee-datasets の第一候補（IMERG / CFSR）に対する例外（平年比較には長期履歴の CHIRPS / ERA5-Land）をここで明示する。
// 関係: tools/coffee/index.js が宣言し、system-prompt.js が連結する。現在月は system の「## 現在日時」から読む（このスキルは決定的な文字列）。
import { formatCalendarTable } from '../../tools/coffee/calendar.js'
import { formatRegionsTable } from '../../tools/coffee/regions.js'
import { formatRiskRules } from '../../tools/coffee/risk-profiles.js'

export const COFFEE_SKILL = `## スキル: コーヒー生産リスク監視（監視カレンダー × Earth Engine）

### 目的
- 主要コーヒー産地について、干ばつ・霜・過剰降雨・台風・植生ストレスが**平年と比べてどの程度異常か**を早期に検知する。収穫量そのものは推定しない。
- **絶対値で判断しない。** 「Rain30 = 54 mm」ではなく「過去 25 年の同時期中央値 142 mm、平年比 38%、下位 8%」のように、平年比と percentile で述べる。
- 入口は coffee_list_monitors（省略時は現在月。現在月は「## 現在日時」から）。産地の地図表示は coffee_show_regions。どちらも GEE ログイン不要。

### 手順（標準）
1. coffee_list_monitors で対象ジョブ（産地・生育段階・リスク種別・優先度）と region（{type:'bbox', bounds}）、リスク種別のプロファイル（データセット・閾値）を得る。
2. リスク種別に応じたデータセットで「現在値」と「過去 N 年（20〜25 年）の同時期の値」を ee_run で計算する（下の型）。region はそのまま ee.Geometry.Rectangle(bounds, null, false) にする。
3. 必要に応じて ee_time_series + show_chart（推移）、ee_add_layer（raw）で地図に出す。産地枠は coffee_show_regions。
4. 回答には必ず「current / median / 平年比 / percentile / 判定レベル / dataset_latest_date（データセットの最終収録日）」を書き、判定はプロファイルの閾値に対応づける。

### データセットと役割分担（gee-datasets スキルの例外）
- このスキルの範囲では、降水の第一候補 NASA/GPM_L3/IMERG_V07（1998〜）や気象の NOAA/CFSR_HARMONIZED（2018〜）ではなく、**平年比較に必要な 20 年以上の履歴を持つ次を使う**:
  - **UCSB-CHG/CHIRPS/DAILY**（1981〜、precipitation mm/日、≒5 km）: Rain7/30/60・無降雨日数・平年比・percentile。コーヒー監視の基本データ。
  - **ECMWF/ERA5_LAND/DAILY_AGGR**（1950〜、≒11 km）: temperature_2m_min / temperature_2m_max（K → −273.15）、volumetric_soil_water_layer_1（m3/m3）、dewpoint_temperature_2m_*、total_precipitation_sum（m → ×1000 mm）。霜・高温・土壌水分・湿度。
- JAXA/GPM_L3/GSMaP/v8/operational（≒0.1°、1 時間）: 1〜72 時間雨量。Vietnam / Indonesia / 中米の豪雨・台風では CHIRPS より優先。**バンド名は ee_describe で確認してから使う。**
- COPERNICUS/S2_SR_HARMONIZED: 現在の植生。NDVI = normalizedDifference(['B8','B4'])、**NDMI = normalizedDifference(['B8','B11'])（干ばつでは NDVI より NDMI の変化を重視）**、NDRE = normalizedDifference(['B8','B5'])。
- MODIS/061/MOD13Q1（NDVI ×0.0001、250 m、16 日、2000〜）: 植生の長期平年比。現在の詳細 → S2、長期比較 → MODIS と役割分担する。
- COPERNICUS/S1_GRD（VV/VH）: 雲の多い雨季（Indonesia / Vietnam / Colombia）の補助。土壌・植生水分変化、豪雨後の冠水。

### 平年比較の型（ee_run）
Rain30 の例。他の指標も同じ骨格（窓の長さ・データセット・reducer を変える）。
\`\`\`
const N = 25;  // 比較年数（20〜25）
const region = ee.Geometry.Rectangle([-46.8, -22.6, -44.4, -20.6], null, false);  // coffee_list_monitors の bounds
const chirps = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY').select('precipitation');
const latest = ee.Date(chirps.aggregate_max('system:time_start'));
const end = latest.advance(1, 'day');  // filterDate は終了排他なので最新日を含める
const start = end.advance(-30, 'day');
const meanOf = (img) => ee.Number(img.reduceRegion({
  reducer: ee.Reducer.mean(), geometry: region, scale: 5000, maxPixels: 1e9, bestEffort: true,
}).get('precipitation'));
const current = meanOf(chirps.filterDate(start, end).sum());
const hist = ee.ImageCollection.fromImages(ee.List.sequence(1, N).map((y) => {
  const s = start.advance(ee.Number(y).multiply(-1), 'year');
  const e = end.advance(ee.Number(y).multiply(-1), 'year');
  return chirps.filterDate(s, e).sum().set('year', s.get('year'));
}));
const stats = hist.map((img) => ee.Feature(null, { year: img.get('year'), rain30: meanOf(img) }));
const values = ee.List(stats.aggregate_array('rain30'));
const median = ee.Number(values.reduce(ee.Reducer.median()));
const below = ee.Number(values.map((v) => ee.Number(v).lt(current)).reduce(ee.Reducer.sum()));
return ee.Dictionary({
  dataset_latest_date: latest.format('YYYY-MM-dd'),
  window_start: start.format('YYYY-MM-dd'), window_end: latest.format('YYYY-MM-dd'),
  current_mm: current, median_mm: median,
  normal_ratio_pct: current.divide(median).multiply(100),
  percentile: below.divide(N).multiply(100),
  years: stats.aggregate_array('year'), values_mm: values,
});
\`\`\`
- 年別の値をチャートにするときは stats（FeatureCollection）を return して save_as_dataset:true → show_chart（bar、x=year）。
- 同型で: 土壌水分 = ERA5-Land volumetric_soil_water_layer_1 の 30 日 mean、Tmax = temperature_2m_max の 7 日 max（−273.15）、Rain7 = 7 日 sum、NDVI 平年比 = MOD13Q1（×0.0001）の同じ 16 日期間の mean。
- 地図: 現在の Rain30 を raw（rescale [0,300], colormap 'blues'）、または平年比 current.divide(hist.median()) を raw（rescale [0,2], 'rdylgn'）で .clip(region)。

### 霜監視の型（Brazil 6〜8 月、ERA5-Land）
\`\`\`
const region = ee.Geometry.Rectangle([-46.8, -22.6, -44.4, -20.6], null, false);
const era = ee.ImageCollection('ECMWF/ERA5_LAND/DAILY_AGGR').select('temperature_2m_min');
const latest = ee.Date(era.aggregate_max('system:time_start'));
const end = latest.advance(1, 'day');
const start = end.advance(-3, 'day');
const tmin = era.filterDate(start, end).min().subtract(273.15).rename('tmin_c');
const opts = { geometry: region, scale: 11000, maxPixels: 1e9, bestEffort: true };
return ee.Dictionary({
  dataset_latest_date: latest.format('YYYY-MM-dd'),
  tmin_min_c: tmin.reduceRegion({ reducer: ee.Reducer.min(), ...opts }).get('tmin_c'),
  frac_below_2c: tmin.lt(2).reduceRegion({ reducer: ee.Reducer.mean(), ...opts }).get('tmin_c'),
  frac_below_0c: tmin.lt(0).reduceRegion({ reducer: ee.Reducer.mean(), ...opts }).get('tmin_c'),
});
\`\`\`
- 地図: tmin を raw（rescale [-5,10], 'coolwarm' 反転）。ERA5-Land は数日遅れるので dataset_latest_date を必ず併記する。

### Brazil 9〜10 月（最大開花期）の重点手順
- 「① 雨が降ったか → ② 十分な量か（最初のまとまった雨の後 10〜20 日の Rain10）→ ③ その後また乾いていないか（DryDays）→ ④ 土壌水分が回復したか → ⑤ 樹冠の水分（NDMI）が回復したか」の順に見る。Rain30 の合計だけで判断しない。

### リスク別の判定ルール（目安）
${formatRiskRules()}

### 注意
- 霜の 2℃ は「被害確定」ではなく詳細確認を始める警戒ライン。ERA5-Land（11 km）は谷底霜を捕捉できない。
- サビ病（Coffee Leaf Rust）は衛星で断定しない。ERA5-Land の気温・露点・降雨から「発生しやすい環境」を判定し、出力名は「Rust Risk」とする（「Rust Detection」としない）。
- コーヒーは多年生樹木で、収穫しても樹冠は残る。NDVI から収穫進捗率は推定できない。収穫期は降雨・乾燥・冠水・植生ストレスを監視し、進捗は外部統計（USDA / CONAB / 輸出量 / 港湾データ）と併記する。
- NOAA/IBTrACS/v4 は 2024-05 までの収録。台風・ハリケーンのリアルタイム進路には使わない（進路は外部情報、降水影響は GSMaP、被害は S1/S2）。
- 隔年結果（オン年/オフ年）は衛星で判定しない。外部情報を併記する。
- データセットごとに最終収録日が違う（CHIRPS / ERA5-Land / GSMaP / S2 で一致しない）。各分析で aggregate_max('system:time_start') を取り、metric の対象期間と dataset_latest_date を必ず併記する。
- **このアプリでは単発分析を行う。** Risk Score の日次蓄積・バックテスト・外部 API（台風進路・先物価格）連携は対象外。求められたら「分析結果をデータセット/チャートとして出す」までを行い、蓄積は対象外と伝える。
- 産地の bbox は概略（海・非栽培地を含む）。州平均よりは栽培地域に近いが厳密な栽培ポリゴンではないことを断る。

### 監視カレンダー（月 × 産地 × 生育段階 × リスク）
${formatCalendarTable()}

### 産地一覧（概略 bbox）
${formatRegionsTable()}`
