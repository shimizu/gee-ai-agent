// GEE コアスキル。
// 役割: ツール内で Earth Engine JavaScript を書くときの規約・落とし穴・主要データセットの
//       カタログをエージェントに与える。
// 関係: tools/gee/index.js が宣言し、system-prompt.js が連結する。
export const GEE_CORE_SKILL = `## スキル: Earth Engine コードの書き方（ee_run / ee_add_layer / ee_time_series / ee_describe）

### コードの形
- code は「関数本体」。\`ee\` と \`ctx\` が使え、\`return\` で結果を返す。\`await\` も使える。
- Code Editor の \`Map.addLayer\` / \`print\` / \`ui.*\` / \`Export.*\` は存在しない。代わりに ee_add_layer（地図）、ee_run の return（値）、ee_time_series（時系列）を使う。
- 戻り値が ee オブジェクトなら自動で evaluate される。\`getInfo()\` は使わない（ブロッキング）。
- \`ctx.mapBounds()\` = 現在の地図表示範囲の ee.Geometry。\`ctx.geometry\` = ユーザー指定の AOI（null のことが多い）。
- 領域を引数に取るツール（ee_time_series）の region は {type:'map_view'} / {type:'point', lon, lat, buffer_m} / {type:'bbox', bounds:[w,s,e,n]} / {type:'geojson', geometry} / {type:'layer', layer_id}。

### 手順（標準）
1. 対象データセットの ID とバンド名に自信が無ければ ee_describe で確認する（例: \`return ee.ImageCollection('MODIS/061/MOD13Q1').filterDate('2023-01-01','2024-01-01')\`）。
2. 地図表示は ee_add_layer。数値は ee_run（reduceRegion など）。時系列は ee_time_series → show_chart。
3. 重い処理は先に範囲（filterBounds / region）と期間を絞り、scale を粗めに。失敗したら scale を粗く・maxPixels を大きく・bestEffort:true。

### 必ず守ること
- reduceRegion には geometry / scale / maxPixels（例 1e9）/ bestEffort:true を付ける。
- ImageCollection を地図に出すときは .median() / .mosaic() / .mean() などで 1 枚にする（ee_add_layer は ImageCollection を mosaic する）。
- Sentinel-2 は COPERNICUS/S2_SR_HARMONIZED（反射率は 0–10000 スケール。真色は B4,B3,B2 で min 0 max 3000）。雲は 'CLOUDY_PIXEL_PERCENTAGE' でフィルタするか、QA60 / SCL でマスクする。
- Landsat 8/9 C2 L2（LANDSAT/LC08/C02/T1_L2, LANDSAT/LC09/C02/T1_L2）は SR_B* を 0.0000275 倍 −0.2 で反射率に直す。真色は SR_B4,SR_B3,SR_B2（min 0 max 0.3）。
- NDVI は \`img.normalizedDifference(['B8','B4']).rename('NDVI')\`（S2）。MODIS NDVI（MOD13Q1 の NDVI バンド）は 0.0001 倍。
- 日付は ee.Date / filterDate('YYYY-MM-DD','YYYY-MM-DD')。終了日は排他的。
- 可視化は EE の visualize ではなく ee_add_layer の vis（png）か rescale/colormap（raw）に渡す。

### 主要データセット（ID / 主バンド / 解像度 / 備考）
- COPERNICUS/S2_SR_HARMONIZED — B2,B3,B4,B8(10m), B11,B12(20m), SCL, QA60 — 2017〜 — 光学。真色 [B4,B3,B2] 0–3000。
- COPERNICUS/S1_GRD — VV, VH（10m）— SAR。'instrumentMode'=='IW' でフィルタ。洪水・船舶検出に。値は dB。
- LANDSAT/LC08/C02/T1_L2, LANDSAT/LC09/C02/T1_L2 — SR_B2..SR_B7（30m）, ST_B10 — 2013〜 — スケール 0.0000275, オフセット −0.2。
- MODIS/061/MOD13Q1 — NDVI, EVI（250m, 16 日）— 0.0001 倍。
- MODIS/061/MOD11A2 — LST_Day_1km（1km, 8 日）— 0.02 倍 K。
- NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG — avg_rad（夜間光, 月次, ~500m）— 2014〜。cf_cvg で雲カバーの少ない月を選ぶ。
- NASA/VIIRS/002/VNP46A2 — DNB_BRDF_Corrected_NTL（夜間光, 日次）。
- UCSB-CHG/CHIRPS/DAILY — precipitation（mm/日, ~5.5km）。
- ECMWF/ERA5_LAND/DAILY_AGGR — temperature_2m, total_precipitation_sum（~11km, 日次）。K と m。
- USGS/SRTMGL1_003 — elevation（30m）。NASA/NASADEM_HGT/001 も可。
- ESA/WorldCover/v200 — Map（10m 土地被覆 2021）。クラス値 10 樹木, 20 低木, 30 草地, 40 農地, 50 建物, 60 裸地, 80 水域, 90 湿地, 95 マングローブ。
- GOOGLE/DYNAMICWORLD/V1 — label, built, water, trees…（10m, 2015〜, 日次確率）。built の平均で市街地変化。
- JRC/GSW1_4/GlobalSurfaceWater — occurrence, seasonality（30m）。JRC/GSW1_4/MonthlyHistory で月別水面。
- WorldPop/GP/100m/pop — population（100m, 年別）。
- CIESIN/GPWv411/GPW_Population_Count — population_count（~1km）。
- FAO/GAUL/2015/level0, level1, level2 — 国/州/郡の境界（FeatureCollection。ADM0_NAME 等）。
- USDOS/LSIB_SIMPLE/2017 — 国境（country_na）。
- COPERNICUS/CORINE/V20/100m/2018 — landcover（欧州）。
- JAXA/ALOS/AW3D30/V3_2 — DSM（30m）。
- NOAA/GFS0P25 / NASA/GPM_L3/IMERG_V07 — 気象・降水（時間別）。

### やってはいけないこと
- バンド名・アセット ID を推測して使う（まず ee_describe）。
- 地球全体を高解像度で reduceRegion する（scale を粗く、範囲を絞る）。
- 結果の巨大な配列（画素値リストなど）を ee_run で return する（集約してから返す、または save_as_dataset）。
- ee_time_series で数千枚の画像を回す（月合成してから、または max_images を設定）。`
