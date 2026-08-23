// GEE データセットスキル（基本スキル）。
// 役割: 用途別に「まず使うべきデータセット」（降水 = IMERG、気象 = CFSR_HARMONIZED など）とその ID・バンド・単位・解像度・期間・変換のノウハウを
//       エージェントに与える。存在しない ID やバンド名の推測を減らし、用途に合った選択をさせる。
// 関係: tools/gee/index.js が宣言し、system-prompt.js が連結する。個別の書き方は gee-core、可視化は gee-viz。
export const GEE_DATASETS_SKILL = `## スキル: Google Earth Engine データセット（用途別の選び方）

ID・バンド名は以下をそのまま使う。一覧に無いものや自信が無いものは ee_describe で確認してから使う。
（日付は filterDate('開始','終了') で終了日は含まない。ImageCollection は合成（median/mean/sum）してから地図に出す）

### 降水量 — まず NASA/GPM_L3/IMERG_V07 を使う
- **NASA/GPM_L3/IMERG_V07**（ee.ImageCollection）— GPM IMERG の全球降水。**降水量（雨量・豪雨・降水の推移）を調べるときは原則このデータセットを使う。**
  - 期間: 1998-01-01 〜 現在（数日遅れで更新）。30 分ごと。解像度 ≒ 11 km（0.1°）。
  - バンド: precipitation（mm/hr, 較正済み・これを使う）、MWprecipitation / IRprecipitation（mm/hr, 元データ）、precipitationQualityIndex。
  - 使い方の型（値は mm/hr の瞬間強度。30 分画像なので積算は ×0.5 時間）:
    - 期間の総降水量（mm）: select('precipitation').sum().multiply(0.5)
    - 日降水量（mm/日）の時系列: 1 日ごとに sum×0.5 した画像を作る（例: ee.List.sequence で日付を回し ee.ImageCollection.fromImages）か、ee_time_series で reducer 'mean' → 値（mm/hr 平均）× 24 = mm/日 として説明する
    - 月降水量: 同様に月ごとに sum×0.5。平均強度 mm/hr × 時間数でもよい
    - 地図: 期間合計（mm）を raw で rescale [0, 上限] colormap 'blues'、または 'ylgnbu'
    - 注意: 2025-09-30 以降は暫定（provisional）版。最新数日は欠けることがある。画像数が多い（1 日 48 枚）ので期間を絞るか日/月に集約してから時系列にする
  - 補助: 長期の日次・高解像度（~5 km, 1981〜）は UCSB-CHG/CHIRPS/DAILY（precipitation mm/日）。予報は NOAA/GFS0P25。

### 気象（気温・風・湿度・気圧・日射）— まず NOAA/CFSR_HARMONIZED を使う
- **NOAA/CFSR_HARMONIZED**（ee.ImageCollection）— 全球の大気再解析（CFSR/CFSv2 を統合）。**降水以外の気象情報（気温・風・湿度・気圧・日射）を調べるときは原則このデータセットを使う。**
  - 期間: 2018-12-13 〜 現在（ほぼリアルタイム更新）。6 時間ごと（00/06/12/18 UTC）。解像度 ≒ 55 km（0.5°）。
  - 主なバンド:
    - 気温: Temperature_height_above_ground（K, 地上 2m 相当）、Temperature_surface（K, 地表面）。°C = K − 273.15
    - 風: u-component_of_wind_hybrid / v-component_of_wind_hybrid（m/s）。風速 = sqrt(u²+v²)
    - 湿度: Relative_humidity_entire_atmosphere_single_layer（%）、Specific_humidity_height_above_ground
    - 気圧: Pressure_surface / Pressure_msl（Pa。hPa = /100）
    - 放射: Downward_Short-Wave_Radiation_Flux_surface（W/m²）
    - 降水も持つ（Precipitation_rate_surface_3_Hour_Average kg/m²/s、Total_precipitation_surface_3_Hour_Accumulation）が、降水量の本命は上の IMERG。CFSR の降水は気温・風と同じ格子で合わせて見たいときに使う
  - 使い方の型:
    - 日別・月別の時系列: ee_time_series で select したコレクションを渡し、date_format 'YYYY-MM-dd'（日）や 'YYYY-MM'（月）で reducer mean → 単位を変換（K→−273.15、Pa→/100）して説明する
    - 解像度が粗い（55 km）ので、都市単位の比較には向かない。広域・時間変化の把握に使う
  - 補助: 2018-12 以前・陸域詳細（~11 km, 1950〜）は ECMWF/ERA5_LAND/DAILY_AGGR（temperature_2m K, total_precipitation_sum m→×1000 mm）。予報は NOAA/GFS0P25（temperature_2m_above_ground °C）。

### 光学衛星画像（真色・偽色・指標）
- COPERNICUS/S2_SR_HARMONIZED — Sentinel-2 地表反射率。B2,B3,B4,B8（10 m）, B11,B12（20 m）, SCL, QA60。2017〜。反射率は 0–10000。雲は CLOUDY_PIXEL_PERCENTAGE でフィルタ、SCL/QA60 でマスク。真色 [B4,B3,B2] 0–3000。NDVI = normalizedDifference(['B8','B4'])。
- LANDSAT/LC08/C02/T1_L2, LANDSAT/LC09/C02/T1_L2 — Landsat 8/9（30 m, 2013〜）。SR_B2..SR_B7 は ×0.0000275 − 0.2 で反射率。真色 [SR_B4,SR_B3,SR_B2] 0–0.3。QA_PIXEL で雲マスク。
- LANDSAT/LT05/C02/T1_L2, LANDSAT/LE07/C02/T1_L2 — 過去（1984〜）の比較用。
- MODIS/061/MOD13Q1 — NDVI/EVI（250 m, 16 日）×0.0001。MODIS/061/MOD09GA — 日次反射率（500 m）。

### SAR・夜間光
- COPERNICUS/S1_GRD — Sentinel-1 VV/VH（10 m, dB）。instrumentMode 'IW'、orbitProperties_pass で軌道統一。洪水・船舶・構造物。
- NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG — 夜間光 avg_rad（月次, ~500 m, 2014〜）。cf_cvg で雲の少ない月を選ぶ。
- NASA/VIIRS/002/VNP46A2 — 夜間光 日次。

### 地形・水・土地被覆・人口・境界
- USGS/SRTMGL1_003（elevation, 30 m）/ NASA/NASADEM_HGT/001 / JAXA/ALOS/AW3D30/V3_2（DSM）/ COPERNICUS/DEM/GLO30（DEM）。傾斜は ee.Terrain.slope()。
- JRC/GSW1_4/GlobalSurfaceWater（occurrence, seasonality; 30 m）、JRC/GSW1_4/MonthlyHistory（月別水面）。
- ESA/WorldCover/v200（Map, 10 m, 2021。10 樹木, 20 低木, 30 草地, 40 農地, 50 建物, 60 裸地, 80 水域, 90 湿地, 95 マングローブ）。
- GOOGLE/DYNAMICWORLD/V1（label, built, water, trees…確率; 10 m, 2015〜, 日次）。built の年平均差分で市街地変化。
- MODIS/061/MCD12Q1（LC_Type1 年次土地被覆 500 m）。
- WorldPop/GP/100m/pop（人口 100 m）、CIESIN/GPWv411/GPW_Population_Count（~1 km）。
- FAO/GAUL/2015/level0,1,2（国/州/郡 境界 FeatureCollection。ADM0_NAME, ADM1_NAME, ADM2_NAME）、USDOS/LSIB_SIMPLE/2017（国境 country_na）。

### 海洋・大気汚染・火災
- NASA/OCEANDATA/MODIS-Aqua/L3SMI（chlor_a, sst）、HYCOM/sea_temp_salinity（水温・塩分）、NOAA/CDR/OISST/V2_1（sst ×0.01 °C）。
- COPERNICUS/S5P/NRTI/L3_NO2（NO2_column_number_density）、L3_CO、L3_AER_AI、L3_SO2（Sentinel-5P 大気）。
- FIRMS（T21 火災熱異常 日次）、MODIS/061/MOD14A1（FireMask）。

### 選び方の原則
- 「降水量」→ まず NASA/GPM_L3/IMERG_V07。「気温・風・湿度・気圧・日射」→ まず NOAA/CFSR_HARMONIZED。別のものを使うときは理由（期間外・解像度・予報）を説明する。
- 「今の様子を見たい」→ S2（10 m）。「長期比較」→ Landsat。「広域・頻度」→ MODIS。「雲が多い/夜/洪水」→ S1 SAR。
- 単位・スケール係数は必ず変換して説明に書く（K→°C、mm/s→mm/日、反射率 ×0.0001 など）。`
