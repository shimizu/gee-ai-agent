// リスク種別ごとの監視プロファイル（純関数・データ）。
//
// 役割: riskType（drought / frost / excess_rain / storm / structural）に対して「使うデータセット・指標・判定閾値・EE の書き方の要点・注意」を持つ。
//       coffee_list_monitors がジョブに添えて返し、スキルの判定ルール表もここから生成する。閾値は coffee.md の目安で、確定値ではない。
// 関係: calendar.js（riskType）、handlers.js、agent/skills/coffee.js。
export const RISK_PROFILES = {
  drought: {
    label: '干ばつ',
    datasets: [
      { id: 'UCSB-CHG/CHIRPS/DAILY', bands: ['precipitation'], unit: 'mm/日', role: 'Rain7/30/60・連続無降雨日数・平年比（1981〜）', scale: 5000 },
      { id: 'ECMWF/ERA5_LAND/DAILY_AGGR', bands: ['volumetric_soil_water_layer_1', 'temperature_2m_max'], unit: 'm3/m3, K', role: '土壌水分・高温（1950〜）', scale: 11000 },
      { id: 'COPERNICUS/S2_SR_HARMONIZED', bands: ['B8', 'B11', 'B4'], unit: '反射率 0–10000', role: 'NDMI = normalizedDifference([B8,B11])（干ばつでは NDVI より重視）', scale: 20 },
      { id: 'MODIS/061/MOD13Q1', bands: ['NDVI'], unit: '×0.0001', role: '植生の長期平年比（2000〜）', scale: 250 },
    ],
    indicators: ['rain30_normal_ratio', 'rain30_percentile', 'dry_days', 'soil_moisture_percentile', 'tmax_7d', 'ndmi_anomaly'],
    thresholds: [
      { level: 'WATCH', rule: 'Rain30 が過去 20〜25 年の同時期の 20 percentile 未満' },
      { level: 'WARNING', rule: 'Rain30 が 10 percentile 未満 かつ 土壌水分が 20 percentile 未満' },
      { level: 'CRITICAL', rule: 'Rain30 が 5 percentile 未満 かつ 植生指数（NDMI/NDVI）が低下' },
    ],
    eeHint: "chirps.filterDate(start, end).select('precipitation').sum()（start = end − 30 日、end = 最新日 + 1 日）を過去 N 年の同時期と比べる",
    caveat: '開花期（Brazil 9〜10 月）は Rain30 だけでなく「最初のまとまった雨 → その後 10〜20 日の降水（Rain10）→ DryDays → 土壌水分 → NDMI」の順で見る。',
  },
  frost: {
    label: '霜・寒波',
    datasets: [
      { id: 'ECMWF/ERA5_LAND/DAILY_AGGR', bands: ['temperature_2m_min'], unit: 'K（°C = K − 273.15）', role: '直近 3 日の最低気温と 2℃/0℃ 未満の面積率', scale: 11000 },
    ],
    indicators: ['tmin_3d', 'area_fraction_below_2c', 'area_fraction_below_0c'],
    thresholds: [
      { level: 'WATCH', rule: 'Tmin < 2℃（詳細確認を始める警戒ライン。被害確定ではない）' },
      { level: 'WARNING', rule: 'Tmin < 0℃ の面積率が有意（目安 10% 以上）' },
      { level: 'CRITICAL', rule: 'Tmin < 0℃ が広域・複数日' },
    ],
    eeHint: "era.filterDate(start, end).select('temperature_2m_min').min().subtract(273.15)（直近 3 日）",
    caveat: 'ERA5-Land は約 11 km なので谷底の局地霜は捕捉できない。地域的な霜リスクの検出に使い、被害の確定は現地情報で行う。',
  },
  excess_rain: {
    label: '過剰降雨',
    datasets: [
      { id: 'UCSB-CHG/CHIRPS/DAILY', bands: ['precipitation'], unit: 'mm/日', role: 'Rain3/7/30・強雨日数（例 > 30 mm/日）・平年 percentile', scale: 5000 },
      { id: 'JAXA/GPM_L3/GSMaP/v8/operational', bands: [], unit: 'mm/hr', role: '1〜72 時間雨量（Vietnam / Indonesia / 中米では CHIRPS より優先）。バンド名は ee_describe で確認する', scale: 11000 },
      { id: 'COPERNICUS/S1_GRD', bands: ['VV'], unit: 'dB', role: '豪雨後の冠水（雲を透過）', scale: 30 },
    ],
    indicators: ['rain7_percentile', 'rain30_percentile', 'heavy_rain_days'],
    thresholds: [
      { level: 'WATCH', rule: 'Rain7 が 90 percentile 超' },
      { level: 'WARNING', rule: 'Rain7 が 95 percentile 超' },
      { level: 'CRITICAL', rule: 'Rain7 が 95 percentile 超 かつ Rain30 が 90 percentile 超' },
    ],
    eeHint: 'Rain7 / Rain30 を平年比較の型（過去 N 年の同時期）で percentile 化する',
    caveat: '収穫期のジョブでは 1 段階引き上げてよい。収穫の進捗率は衛星から推定できない（外部統計と併記）。',
  },
  storm: {
    label: '台風・ハリケーン',
    datasets: [
      { id: 'JAXA/GPM_L3/GSMaP/v8/operational', bands: [], unit: 'mm/hr', role: '24 時間 / 72 時間累積雨量。バンド名は ee_describe で確認する', scale: 11000 },
      { id: 'COPERNICUS/S1_GRD', bands: ['VV'], unit: 'dB', role: '通過後の冠水・植生構造変化', scale: 30 },
      { id: 'COPERNICUS/S2_SR_HARMONIZED', bands: ['B8', 'B4'], unit: '反射率 0–10000', role: '通過前後の NDVI 差分（雲が晴れてから）', scale: 20 },
    ],
    indicators: ['rain24h', 'rain72h'],
    thresholds: [
      { level: 'WATCH', rule: '24h > 100 mm または 72h > 200 mm（絶対値の目安。平年 percentile も併記）' },
      { level: 'WARNING', rule: '72h > 300 mm、または S1 で広域の冠水' },
    ],
    eeHint: 'GSMaP を filterDate(最新 − 72h, 最新 + 1h) で sum し、地域平均と最大値を返す',
    caveat: 'NOAA/IBTrACS/v4 は 2024-05 までの収録なので進路のリアルタイム監視には使わない。進路は外部気象情報、降水影響は GSMaP、被害は S1/S2 と分担する。',
  },
  structural: {
    label: '隔年結果（構造要因）',
    datasets: [],
    indicators: [],
    thresholds: [],
    eeHint: '',
    caveat: '衛星では判定しない。オン年/オフ年は CONAB / USDA などの外部情報を併記し、気象リスクの解釈に加える。',
  },
}

export const RISK_TYPES = Object.keys(RISK_PROFILES)

export function getRiskProfile(type) {
  const p = RISK_PROFILES[type]
  if (!p) throw new Error(`未知のリスク種別: ${type}。有効な値: ${RISK_TYPES.join(', ')}`)
  return p
}

// スキル用: リスク種別ごとの判定ルールを箇条書きにする。
export function formatRiskRules() {
  const lines = []
  for (const [type, p] of Object.entries(RISK_PROFILES)) {
    const ds = p.datasets.map((d) => d.id).join(', ')
    lines.push(`- ${type}（${p.label}）${ds ? `: ${ds}` : ''}`)
    for (const t of p.thresholds) lines.push(`  - ${t.level}: ${t.rule}`)
    if (p.caveat) lines.push(`  - 注意: ${p.caveat}`)
  }
  return lines.join('\n')
}
