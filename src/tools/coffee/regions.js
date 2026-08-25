// コーヒー主要産地の概略ジオメトリ（純関数・データ）。
//
// 役割: 監視カレンダー（calendar.js）が参照する産地を bbox で持つ。行政界（州全域）ではなく主産地の矩形に絞り、
//       ee_time_series / ee_run にそのまま渡せる {type:'bbox', bounds} と、地図表示用の GeoJSON を作る。
//       値は概略（海・非栽培地を含む）。精緻化するときは bounds を Polygon に差し替え、regionsToFeatureCollection だけ直す。
// 関係: calendar.js（regionIds）、handlers.js（coffee_show_regions）、agent/skills/coffee.js（産地一覧の表を生成）。
export const REGIONS = [
  { id: 'BR_SUL_MINAS', country: 'Brazil', name: 'Sul de Minas', species: 'arabica', bounds: [-46.8, -22.6, -44.4, -20.6], note: 'Varginha / Guaxupé / Alfenas / Três Pontas' },
  { id: 'BR_CERRADO_MINEIRO', country: 'Brazil', name: 'Cerrado Mineiro', species: 'arabica', bounds: [-48.5, -20.0, -46.0, -18.0], note: 'Patrocínio / Monte Carmelo / Araguari / Patos de Minas' },
  { id: 'BR_MOGIANA_SP', country: 'Brazil', name: 'Mogiana (São Paulo)', species: 'arabica', bounds: [-48.0, -22.4, -46.8, -20.2], note: 'Franca / Mococa / Espírito Santo do Pinhal' },
  { id: 'BR_PARANA_NORTE', country: 'Brazil', name: 'Paraná 北部', species: 'arabica', bounds: [-52.5, -24.0, -49.5, -22.6], note: 'Londrina / Maringá / Jacarezinho（霜リスク帯）' },
  { id: 'BR_ESPIRITO_SANTO', country: 'Brazil', name: 'Espírito Santo 北部', species: 'robusta (conilon)', bounds: [-41.2, -20.3, -39.6, -18.0], note: 'Linhares / São Mateus / Colatina' },
  { id: 'VN_CENTRAL_HIGHLANDS', country: 'Vietnam', name: 'Central Highlands (Dak Lak)', species: 'robusta', bounds: [107.4, 11.6, 108.9, 13.6], note: 'Buôn Ma Thuột / Dak Nong / Gia Lai 南部 / Lâm Đồng 北部' },
  { id: 'ID_SUMATRA_SOUTH', country: 'Indonesia', name: 'Lampung – South Sumatra', species: 'robusta', bounds: [103.0, -5.6, 105.4, -3.6], note: 'Lampung 西部 / Pagar Alam / Lahat' },
  { id: 'CO_CENTRAL', country: 'Colombia', name: 'Antioquia – Caldas', species: 'arabica', bounds: [-76.3, 4.3, -74.9, 7.0], note: 'Medellín 南西 / Manizales / Pereira / Armenia' },
  { id: 'CA_HONDURAS_GUATEMALA', country: 'Central America', name: 'Honduras – Guatemala', species: 'arabica', bounds: [-92.0, 13.5, -86.0, 15.8], note: 'Huehuetenango / Antigua / Copán / Comayagua' },
]

const BY_ID = new Map(REGIONS.map((r) => [r.id, r]))

export function getRegion(id) {
  return BY_ID.get(id)
}

// ids があればそれを優先（未知 ID はエラー）。無ければ country の部分一致（大文字小文字無視）。両方無しなら全件。
export function filterRegions({ ids, country } = {}) {
  if (Array.isArray(ids) && ids.length) {
    const unknown = ids.filter((id) => !BY_ID.has(id))
    if (unknown.length) throw new Error(`未知の産地 ID: ${unknown.join(', ')}。有効な ID: ${REGIONS.map((r) => r.id).join(', ')}`)
    return ids.map((id) => BY_ID.get(id))
  }
  if (country) {
    const q = String(country).toLowerCase()
    return REGIONS.filter((r) => r.country.toLowerCase().includes(q) || r.name.toLowerCase().includes(q))
  }
  return REGIONS.slice()
}

// ee_time_series などの region 引数にそのまま渡せる形。
export function regionToBbox(region) {
  return { type: 'bbox', bounds: region.bounds.slice() }
}

// bbox → 閉じたリングの Polygon FeatureCollection（bounds 依存はここに閉じ込める）。
export function regionsToFeatureCollection(regions = REGIONS) {
  return {
    type: 'FeatureCollection',
    features: regions.map((r) => {
      const [w, s, e, n] = r.bounds
      return {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] },
        properties: { region_id: r.id, country: r.country, name: r.name, species: r.species },
      }
    }),
  }
}

// スキル用の Markdown 表。
export function formatRegionsTable(regions = REGIONS) {
  const lines = ['| ID | 国 | 産地 | 種 | bbox [w,s,e,n] |', '|---|---|---|---|---|']
  for (const r of regions) lines.push(`| ${r.id} | ${r.country} | ${r.name} | ${r.species} | [${r.bounds.join(', ')}] |`)
  return lines.join('\n')
}
