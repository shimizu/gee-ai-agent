// raw レイヤーのホバー値表示（地図右下の小パネル）。
//
// 役割: useMapHover が作った { name, bands, values } の配列を表示する。値が無ければ何も出さない。
import { formatNumber } from '../utils/format.js'

function HoverReadout({ items }) {
  if (!items || items.length === 0) return null
  return (
    <div className="hover-readout" role="status">
      {items.map((it) => (
        <div className="hover-row" key={it.layerId}>
          <span className="hover-name">{it.name}</span>
          <span className="hover-values">
            {it.values == null
              ? 'なし'
              : it.values.map((v, i) => `${it.bands[i] ?? `b${i + 1}`}=${formatNumber(v, { maxFractionDigits: 4 })}`).join('  ')}
          </span>
        </div>
      ))}
    </div>
  )
}

export default HoverReadout
