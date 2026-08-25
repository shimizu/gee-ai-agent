// コーヒー生産リスクの監視カレンダー（純関数・データ）。
//
// 役割: 「どの産地を・いつ・何のリスクで・どの重要度で監視するか」を 1 行 1 ジョブで持つ（coffee.md 末尾の TSV を 1:1 で写した）。
//       activeMonitors で月・国・リスク種別から該当ジョブを引き、スキルの表もここから生成する（単一情報源）。
// 関係: regions.js（regionIds）、risk-profiles.js（riskType）、handlers.js（coffee_list_monitors）、agent/skills/coffee.js。
const BR_ARABICA = ['BR_SUL_MINAS', 'BR_CERRADO_MINEIRO', 'BR_MOGIANA_SP']
const BR_ARABICA_FROST = [...BR_ARABICA, 'BR_PARANA_NORTE']

export const CALENDAR = [
  { id: 'BR_ARABICA_VERANICO', startMonth: 1, endMonth: 2, country: 'Brazil', region: 'Minas Gerais / Sao Paulo', regionIds: BR_ARABICA, species: 'arabica', stage: '果実肥大期', risk: 'veranico（雨季中の乾燥）', riskType: 'drought', priority: 'high', note: '2014 年相場の主因。豆の重さが決まる' },
  { id: 'CO_MAIN_FLOWERING', startMonth: 1, endMonth: 2, country: 'Colombia', region: 'Central (Antioquia / Caldas)', regionIds: ['CO_CENTRAL'], species: 'arabica', stage: '主開花期', risk: '日照不足・過剰降雨', riskType: 'excess_rain', priority: 'medium', note: '主収穫 10-12 月の約 8 ヶ月前' },
  { id: 'VN_FLOWERING_IRRIGATION', startMonth: 1, endMonth: 3, country: 'Vietnam', region: 'Central Highlands (Dak Lak)', regionIds: ['VN_CENTRAL_HIGHLANDS'], species: 'robusta', stage: '開花期', risk: '灌漑水確保', riskType: 'drought', priority: 'high', note: '乾季中は灌漑依存' },
  { id: 'BR_ARABICA_BEAN_FILLING', startMonth: 3, endMonth: 4, country: 'Brazil', region: 'Minas Gerais / Sao Paulo', regionIds: BR_ARABICA, species: 'arabica', stage: '豆充実期', risk: '乾燥・高温', riskType: 'drought', priority: 'high', note: '密度・サイズ確定' },
  { id: 'CO_FRUIT_SET_RUST', startMonth: 3, endMonth: 4, country: 'Colombia', region: 'Central', regionIds: ['CO_CENTRAL'], species: 'arabica', stage: '結実安定期', risk: '過剰降雨・サビ病', riskType: 'excess_rain', priority: 'medium', note: 'ラニーニャ年に注意' },
  { id: 'VN_DRY_SEASON_END', startMonth: 2, endMonth: 4, country: 'Vietnam', region: 'Central Highlands (Dak Lak)', regionIds: ['VN_CENTRAL_HIGHLANDS'], species: 'robusta', stage: '乾季末', risk: '水不足・高温', riskType: 'drought', priority: 'high', note: '2024 年高騰の主因の一つ' },
  { id: 'BR_ARABICA_HARVEST_START', startMonth: 5, endMonth: 5, country: 'Brazil', region: 'Minas Gerais / Sao Paulo', regionIds: BR_ARABICA, species: 'arabica', stage: '収穫開始', risk: '収穫遅延・品質低下', riskType: 'excess_rain', priority: 'medium', note: '' },
  { id: 'CO_MITACA_HARVEST', startMonth: 5, endMonth: 5, country: 'Colombia', region: 'Central', regionIds: ['CO_CENTRAL'], species: 'arabica', stage: 'ミタカ収穫期', risk: '過剰降雨', riskType: 'excess_rain', priority: 'low', note: 'ミタカは年間の 30-40%' },
  { id: 'BR_FROST', startMonth: 6, endMonth: 8, country: 'Brazil', region: 'Minas Gerais / Sao Paulo / Parana', regionIds: BR_ARABICA_FROST, species: 'arabica', stage: '収穫期・休眠期', risk: '霜・寒波', riskType: 'frost', priority: 'critical', note: '2021 年 7 月霜が近年最大ショック。最優先監視' },
  { id: 'ID_HARVEST_RAIN', startMonth: 6, endMonth: 8, country: 'Indonesia', region: 'Sumatra (Lampung / South Sumatra)', regionIds: ['ID_SUMATRA_SOUTH'], species: 'robusta', stage: '収穫期', risk: '収穫期の雨・乾燥不良', riskType: 'excess_rain', priority: 'medium', note: 'ラニーニャ年に品質悪化' },
  { id: 'BR_CONILON_HARVEST', startMonth: 4, endMonth: 8, country: 'Brazil', region: 'Espirito Santo', regionIds: ['BR_ESPIRITO_SANTO'], species: 'robusta (conilon)', stage: 'コニロン収穫期', risk: '収穫遅延', riskType: 'excess_rain', priority: 'low', note: 'アラビカと周期がずれる' },
  { id: 'CO_MITACA_FLOWERING', startMonth: 8, endMonth: 9, country: 'Colombia', region: 'Central', regionIds: ['CO_CENTRAL'], species: 'arabica', stage: 'ミタカ開花期', risk: '乾燥・日照', riskType: 'drought', priority: 'medium', note: 'ミタカ収穫 4-6 月の逆算' },
  { id: 'ID_PRE_FLOWERING', startMonth: 8, endMonth: 9, country: 'Indonesia', region: 'Sumatra', regionIds: ['ID_SUMATRA_SOUTH'], species: 'robusta', stage: '開花準備期', risk: '雨季入り遅れ', riskType: 'drought', priority: 'medium', note: 'エルニーニョ年に遅延' },
  { id: 'BR_CONILON_FLOWERING', startMonth: 8, endMonth: 9, country: 'Brazil', region: 'Espirito Santo', regionIds: ['BR_ESPIRITO_SANTO'], species: 'robusta (conilon)', stage: 'コニロン開花期', risk: '初雨遅れ', riskType: 'drought', priority: 'medium', note: '' },
  { id: 'BR_ARABICA_FLOWERING', startMonth: 9, endMonth: 10, country: 'Brazil', region: 'Minas Gerais / Sao Paulo', regionIds: BR_ARABICA, species: 'arabica', stage: '最大開花期', risk: '初雨の遅れ・不足', riskType: 'drought', priority: 'critical', note: '来年の収穫量が決まる最重要局面' },
  { id: 'VN_PRE_HARVEST_STORM', startMonth: 9, endMonth: 11, country: 'Vietnam', region: 'Central Highlands', regionIds: ['VN_CENTRAL_HIGHLANDS'], species: 'robusta', stage: '収穫直前', risk: '台風・豪雨', riskType: 'storm', priority: 'medium', note: '収穫遅延' },
  { id: 'CA_HURRICANE', startMonth: 9, endMonth: 11, country: 'Central America', region: 'Honduras / Guatemala', regionIds: ['CA_HONDURAS_GUATEMALA'], species: 'arabica', stage: '結実後期', risk: 'ハリケーン', riskType: 'storm', priority: 'medium', note: '収穫 11-2 月' },
  { id: 'ID_FLOWERING_FRUIT_SET', startMonth: 10, endMonth: 11, country: 'Indonesia', region: 'Sumatra', regionIds: ['ID_SUMATRA_SOUTH'], species: 'robusta', stage: '開花・着果期', risk: '降雨不安定', riskType: 'drought', priority: 'medium', note: '雨季入り 9-11 月' },
  { id: 'BR_ARABICA_FRUIT_SET', startMonth: 11, endMonth: 12, country: 'Brazil', region: 'Minas Gerais / Sao Paulo', regionIds: BR_ARABICA, species: 'arabica', stage: '着果確認', risk: '雨の不規則・着果落ち', riskType: 'drought', priority: 'high', note: '2024 年 11 月のような雨の途切れ' },
  { id: 'VN_HARVEST', startMonth: 10, endMonth: 1, country: 'Vietnam', region: 'Central Highlands', regionIds: ['VN_CENTRAL_HIGHLANDS'], species: 'robusta', stage: '収穫期', risk: '収穫進捗・乾燥', riskType: 'excess_rain', priority: 'medium', note: 'ロンドン相場に直結' },
  { id: 'CO_MAIN_HARVEST', startMonth: 10, endMonth: 12, country: 'Colombia', region: 'Central', regionIds: ['CO_CENTRAL'], species: 'arabica', stage: '主収穫期', risk: '過剰降雨', riskType: 'excess_rain', priority: 'medium', note: '年間の 60-70%' },
  { id: 'BR_BIENNIAL', startMonth: 1, endMonth: 12, country: 'Brazil', region: 'All', regionIds: BR_ARABICA_FROST, species: 'arabica', stage: '隔年結果', risk: 'オン年/オフ年', riskType: 'structural', priority: 'high', note: '気象と独立の基礎要因として併記' },
]

export const PRIORITY_ORDER = ['critical', 'high', 'medium', 'low']

// start > end は年またぎ（例 10〜1 月）。
export function monthInRange(month, start, end) {
  if (start <= end) return month >= start && month <= end
  return month >= start || month <= end
}

export function monthsLabel(row) {
  const { startMonth: s, endMonth: e } = row
  if (s === 1 && e === 12) return '通年'
  if (s === e) return `${s}月`
  if (s > e) return `${s}〜${e}月（年またぎ）`
  return `${s}〜${e}月`
}

function parseMonth(month, now) {
  if (month == null) return now.getMonth() + 1
  const m = Number(month)
  if (!Number.isInteger(m) || m < 1 || m > 12) throw new Error(`month は 1〜12 の整数で指定してください（受け取った値: ${month}）。`)
  return m
}

// 指定月にアクティブな監視ジョブ。country は国名/領域名/産地名の部分一致（大文字小文字無視）、risk は riskType の完全一致。
// 戻りは priority（critical > high > medium > low）→ startMonth の順。
export function activeMonitors({ month, country, risk, now = new Date(), regionLookup } = {}) {
  const m = parseMonth(month, now)
  const q = country ? String(country).toLowerCase() : null
  const matchesCountry = (row) => {
    if (!q) return true
    if (row.country.toLowerCase().includes(q) || row.region.toLowerCase().includes(q)) return true
    if (!regionLookup) return false
    return row.regionIds.some((id) => {
      const r = regionLookup(id)
      return r && (r.name.toLowerCase().includes(q) || r.country.toLowerCase().includes(q))
    })
  }
  return CALENDAR.filter((row) => monthInRange(m, row.startMonth, row.endMonth))
    .filter((row) => !risk || row.riskType === risk)
    .filter(matchesCountry)
    .map((row) => ({ ...row, months: monthsLabel(row) }))
    .sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority) || a.startMonth - b.startMonth)
}

// スキル用の Markdown 表（note は含めない。ツール出力には含める）。
export function formatCalendarTable(rows = CALENDAR) {
  const lines = ['| ID | 月 | 国 | 領域 | 種 | 段階 | リスク | 種別 | 優先度 | 産地 ID |', '|---|---|---|---|---|---|---|---|---|---|']
  for (const r of rows) {
    lines.push(`| ${r.id} | ${monthsLabel(r)} | ${r.country} | ${r.region} | ${r.species} | ${r.stage} | ${r.risk} | ${r.riskType} | ${r.priority} | ${r.regionIds.join(', ')} |`)
  }
  return lines.join('\n')
}
