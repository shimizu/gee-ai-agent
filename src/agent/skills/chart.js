// チャートスキル。
// 役割: いつ・どのチャートを出すか、show_chart の spec の書き方、データの経路（datasetId）を与える。
export const CHART_SKILL = `## スキル: チャート出力（show_chart / analyze_dataset）

### 手順
1. データは先にデータセットにする: ee_time_series（GEE 時系列）/ portwatch_fetch_metrics（港の日次）/ ee_run(save_as_dataset:true)。
2. inspect_dataset で列名と期間を確認する（列名を推測しない）。
3. show_chart に dataset_id・type・x・series を渡す。チャートはチャット内にカードとして出て、クリックで拡大される。
4. 数値の言及（平均・最大・前月比・σ）は analyze_dataset の結果を使う。

### チャート種別の選び方
- line / area: 時系列（x は日付列, xType:'time'）。複数系列は series:[{key:'portcalls',label:'入港数'}, …]。
- bar: カテゴリ比較（国別・業種別・クラス別）。x はカテゴリ列。
- scatter: 2 変数の関係（例: 夜間光 vs 入港数）。
- histogram: 1 列の分布（x に列名、bins 既定 20）。
- 単位の異なる系列（入港数と輸入トン）は別チャートに分ける。

### spec の例
- 港の入港数推移: {type:'line', dataset_id:'ds_001', x:'date', xType:'time', series:[{key:'portcalls',label:'入港数'}], title:'シンガポール港 入港数（日次）', unit:'隻/日', source:'IMF PortWatch（AIS 推計）'}
- NDVI 月次: {type:'line', dataset_id:'ds_002', x:'date', series:[{key:'NDVI'}], title:'NDVI 月平均', note:'MODIS MOD13Q1, 領域平均'}
- 国別の貿易リスク: {type:'bar', dataset_id:'ds_003', x:'country', series:[{key:'exportAtRisk',label:'輸出額/日'}], unit:'USD/日'}

### 注意
- x 列は必ずデータセットに実在する列。日付列名は多くが 'date'。
- 2000 行を超えると間引かれる。日次 3 年程度までは問題ない。
- 推計値・前処理（雲マスク・合成方法）・scale は note か最終回答に書く。`
