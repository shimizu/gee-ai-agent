// GEE 可視化スキル。
// 役割: png / raw の使い分け、vis パラメータとカラーマップ、レイヤー操作の作法を与える。
export const GEE_VIZ_SKILL = `## スキル: 地図レイヤーの可視化（ee_add_layer / update_layer_style）

### png と raw の選び方
- png（既定）: 真色・偽色合成（3 バンド）、カテゴリ（土地被覆）、EE のパレット表示。vis = {bands, min, max, palette, gamma}。EE 側で 8bit 化され高速。
- raw: 単バンドの連続値（NDVI、標高、気温、降水、夜間光、確率、差分）。float 生データがブラウザに届き、GPU で rescale + colormap。利点: (1) ホバーで実値、(2) update_layer_style で colormap / rescale を即時変更、(3) band_math（2 バンドから正規化差分など）。
- 迷ったら: 指標・連続値 → raw、合成画像・カテゴリ → png。

### png の vis 例
- S2 真色: {bands:['B4','B3','B2'], min:0, max:3000}
- S2 偽色（植生）: {bands:['B8','B4','B3'], min:0, max:4000}
- Landsat 反射率（変換後）: {bands:['SR_B4','SR_B3','SR_B2'], min:0, max:0.3}
- NDVI パレット: {min:-0.2, max:0.8, palette:['8b4513','ffff00','00a000','004000']}
- 土地被覆 WorldCover: {bands:['Map'], min:10, max:100, palette:['006400','ffbb22','ffff4c','f096ff','fa0000','b4b4b4','f0f0f0','0064c8','0096a0','00cf75','fae6a0']}（クラス値 10..100 は連続ではないので注意。代わりに remap で 0..10 にしてもよい）
- 夜間光: {bands:['avg_rad'], min:0, max:60, palette:['000000','ffcc00','ffffff']}

### raw の指定例
- NDVI: mode:'raw', rescale:[-0.2, 0.9], colormap:'rdylgn'
- 標高: mode:'raw', rescale:[0, 3000], colormap:'terrain'
- 気温 (°C): rescale:[-10, 40], colormap:'coolwarm'
- 降水: rescale:[0, 50], colormap:'blues'
- 夜間光: rescale:[0, 60], colormap:'inferno'
- 差分（前後比較）: rescale:[-0.3, 0.3], colormap:'rdbu', colormap_reversed:true
- band_math: bands:['B8','B4'], band_math:'normalized_difference', rescale:[-0.2,0.9], colormap:'rdylgn'（画像は B8,B4 を持てばよい）

### カラーマップ名（raw）
連続: viridis, plasma, inferno, magma, cividis, turbo, terrain, jet, rainbow, hot, cool, gray, bone, copper, spring, summer, autumn, winter
単色系: blues, greens, reds, oranges, purples, greys, ylgn, ylgnbu, ylorbr, ylorrd, bugn, bupu, gnbu, orrd, pubu, pubugn, purd, rdpu
発散: rdylgn, rdylbu, rdbu, rdgy, piyg, prgn, brbg, puor, spectral, coolwarm, bwr, seismic
海洋/気象: ocean, deep, dense, algae, matter, turbid, speed, amp, tempo, rain, phase, topo, balance, delta, curl, diff, tarn, haline, thermal, solar, ice
カテゴリ: accent, dark2, paired, pastel1, pastel2, set1, set2, set3, tab10, tab20
（colormap_reversed:true で反転）

### レイヤー操作
- 同じ name で ee_add_layer を呼ぶと置き換わる（png の vis を変えたいときに使う）。
- raw のレンジ/カラーマップ変更は update_layer_style（再計算なし）。
- 比較するときは 2 レイヤーを重ね、上のレイヤーの opacity を 0.6 程度にする。
- 追加後は fit_bounds で対象範囲へ移動する（対象が現在の表示範囲ならそのまま）。
- ベクター（港の点・境界・ee_run の FeatureCollection 結果）は add_vector_layer / portwatch_show_locations。`
