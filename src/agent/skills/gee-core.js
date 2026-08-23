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
- **フィルタ後の FeatureCollection / ImageCollection は size() を確認する。** 空のジオメトリで clip / filterBounds すると真っ白（値なし）のレイヤーになる。ee_add_layer は表示範囲に有効画素が無いとエラーを返すので、そのときは名前・期間・範囲を疑う。
- 境界（FAO GAUL など）を名前で filter するときは、先に ee_describe（distinctValues に実在する名前が出る）か aggregate_array('ADM1_NAME') で表記を確認する。日本の都道府県は GAUL では訓令式ローマ字（Tiba, Gunma, Tokyo, Osaka, Hyogo, Kyoto, Saitama, Kanagawa, Aiti, Hukuoka など）。迷ったら ee.Filter.stringContains('ADM1_NAME', '...') で候補を出す。
- ImageCollection を地図に出すときは .median() / .mosaic() / .mean() などで 1 枚にする（ee_add_layer は ImageCollection を mosaic する）。
- Sentinel-2 は COPERNICUS/S2_SR_HARMONIZED（反射率は 0–10000 スケール。真色は B4,B3,B2 で min 0 max 3000）。雲は 'CLOUDY_PIXEL_PERCENTAGE' でフィルタするか、QA60 / SCL でマスクする。
- Landsat 8/9 C2 L2（LANDSAT/LC08/C02/T1_L2, LANDSAT/LC09/C02/T1_L2）は SR_B* を 0.0000275 倍 −0.2 で反射率に直す。真色は SR_B4,SR_B3,SR_B2（min 0 max 0.3）。
- NDVI は \`img.normalizedDifference(['B8','B4']).rename('NDVI')\`（S2）。MODIS NDVI（MOD13Q1 の NDVI バンド）は 0.0001 倍。
- 日付は ee.Date / filterDate('YYYY-MM-DD','YYYY-MM-DD')。終了日は排他的。
- 可視化は EE の visualize ではなく ee_add_layer の vis（png）か rescale/colormap（raw）に渡す。

### データセットの選び方
「GEE データセット」スキルの一覧から選ぶ（降水は NASA/GPM_L3/IMERG_V07、気温・風などの気象は NOAA/CFSR_HARMONIZED が第一候補）。一覧に無い ID は ee_describe で確認してから使う。

### やってはいけないこと
- バンド名・アセット ID を推測して使う（まず ee_describe）。
- 地球全体を高解像度で reduceRegion する（scale を粗く、範囲を絞る）。
- 結果の巨大な配列（画素値リストなど）を ee_run で return する（集約してから返す、または save_as_dataset）。
- ee_time_series で数千枚の画像を回す（月合成してから、または max_images を設定）。`
