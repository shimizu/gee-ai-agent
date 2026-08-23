// PortWatch スキル。
// 役割: IMF PortWatch のデータの性質・列名の違い・推奨手順・厳守事項を与える。
// 流用元: reference/portwatch-dashboard/src/agent/system-prompt.js と docs/portwatch-api.md を蒸留。
export const PORTWATCH_SKILL = `## スキル: IMF PortWatch（港湾・チョークポイントの通航・貿易データ）

PortWatch は IMF と Oxford 大が衛星 AIS から推計する、約 1,600 港 + 28 チョークポイント（海上要衝: スエズ・パナマ・マラッカ・バブエルマンデブ・ホルムズ等）の日次データ。公開 API・認証不要。出典表記: 「IMF PortWatch (portwatch.imf.org)」。

### 厳守事項
- portid は必ず portwatch_search_locations が返した値だけを使う（推測しない）。
- 合計・平均・前月比・σ などの数値は analyze_dataset の結果だけを使う。inspect_dataset のサンプル行から全体を推測しない。
- 数値は AIS 由来の「推計値」であり税関統計ではない。回答では「推計」と明示し断定しすぎない。
- 日次データは塊状（バルク船でゼロの日と巨大な日が混在）で非常にノイズが多い。単日ではなく 28 日平均・月平均・σ で評価する。最新 2〜3 日は未確定で小さく出ることがある。
- 更新は週次（火曜）。日次粒度。

### 列名の違い（重要）
- 港（scope=port）: portcalls（入港数）, import（輸入量・推計 t）, export（輸出量・推計 t）
- チョークポイント（scope=chokepoint）: n_total（通航数）, capacity（通過貿易量・推計 t）

### 推奨手順
1. portwatch_search_locations で対象地点（portid・scope・lat/lon）を特定。
2. portwatch_fetch_metrics で日次時系列を取得（days で期間。1 年なら 365、最大 1000）→ datasetId。
3. analyze_dataset（summary / trend / anomaly）で数値を計算。
4. show_chart で推移を可視化（line, x:'date'）。
5. 推計である旨と出典を添えて回答。

### 波及リスク・災害
- 「ある港が止まったらどの国・どの港が影響を受けるか」は portwatch_fetch_spillovers（kind=trade: 国別 USD/日、kind=port: 影響先の港 トン/日 + 座標）。港のみ対象、モデル推計。save_as_dataset:true で bar チャートや点レイヤーにできる。
- 災害の影響は portwatch_find_disruptions（GDACS 赤アラートと港の交差。eventtype EQ/TC/FL/VO/DR/WF）。

### 地図
- 港の位置は portwatch_show_locations（portids 指定が確実）。search の結果にも lat/lon があるので GEE の領域指定（{type:'point', lon, lat, buffer_m}）に使える。`
