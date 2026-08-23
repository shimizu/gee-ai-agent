// PortWatch × GEE 複合分析スキル。
// 役割: 港の情報と衛星データを組み合わせる定番レシピを与える。
export const PORTWATCH_X_GEE_SKILL = `## スキル: PortWatch × Earth Engine の複合分析レシピ

共通の入口: portwatch_search_locations で港の lat/lon を得る → GEE の領域は {type:'point', lon, lat, buffer_m:5000〜20000}（港域なら 5〜10km、後背地なら 20〜50km）。

### レシピ 1: 港の活動と夜間光
- 夜間光（NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG の avg_rad）を港周辺 10km で月平均 → ee_time_series（reducer mean, scale 500, date_format 'YYYY-MM'）。
- 入港数（portwatch_fetch_metrics）は日次なので、比較時は「月平均」に言及するか、同じ期間の line チャートを 2 枚並べる。
- 地図: 最新月の夜間光を raw（rescale [0,60], inferno）で重ね、港の点を portwatch_show_locations で表示。

### レシピ 2: 港湾の拡張・埋立（Dynamic World built / Sentinel-2）
- GOOGLE/DYNAMICWORLD/V1 の 'built' を年ごとに平均し差分（後年 − 前年）を raw（rescale [-0.5,0.5], rdbu 反転）で表示。
- あるいは S2 真色の 2 時期を 2 レイヤーで重ね、上を opacity 0.6 にして比較。

### レシピ 3: 洪水・災害と港
- portwatch_find_disruptions で事象と日付・座標を得る → その前後で Sentinel-1（COPERNICUS/S1_GRD, VV）の差分、または JRC/GSW1_4/MonthlyHistory の水面を地図に。
- 同じ期間の入港数を line チャートにして落ち込みを確認（analyze_dataset で前月比・σ）。

### レシピ 4: 船舶の粗カウント（目安）
- Sentinel-1 VV の高後方散乱（例 > −8 dB）を港外の錨地（水域マスク: JRC occurrence > 90）で数える。厳密な船数ではなく相対指標として扱い、その旨を明記。
- 比較対象の日付ごとに ee_run で connectedComponents/reduceRegion(count) を取り、bar チャートに。

### レシピ 5: 気象と通航
- CHIRPS（降水）や ERA5-Land（風・気温）を港周辺で日次集約 → ee_time_series → 入港数と同期間で並べる。

### 注意
- PortWatch は推計、衛星指標も前処理（雲・合成方法・scale）に依存する。因果の断定は避け、「同期間に〜の傾向」と述べる。
- 画像数が多い ImageCollection（S1/S2 の数年分）は月合成してから時系列にする。`
