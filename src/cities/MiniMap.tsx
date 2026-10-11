import { useMemo } from 'react'
import { PLACES, ROAD_LINKS } from 'norden-strategy/data'
import type { City } from '@game/data/city.ts'
import { FACTIONS, factionColor } from '../factions'

/** 拠点の位置（norden-strategy の PLACES）と街道（ROAD_LINKS）の簡易地図。拠点をクリックで選ぶ */

/** 世界の単位（地図の幅が約 700） */
const MARGIN = 40
const POSITIONS = new Map(PLACES.map((p) => [p.id, { x: p.x, y: p.z }]))
const BOUNDS = (() => {
  const xs = PLACES.map((p) => p.x)
  const ys = PLACES.map((p) => p.z)
  const minX = Math.min(...xs) - MARGIN
  const minY = Math.min(...ys) - MARGIN
  return { minX, minY, width: Math.max(...xs) - minX + MARGIN, height: Math.max(...ys) - minY + MARGIN }
})()

/** 人口で拠点の点の大きさを変える（世界の単位） */
const radiusOf = (population: number) => 4 + Math.sqrt(Math.max(population, 0) / 1000) * 2

export function MiniMap({ cities, selectedId, onSelect }: {
  cities: readonly City[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  const byId = useMemo(() => new Map(cities.map((c) => [c.id, c])), [cities])
  const neighbours = useMemo(
    () => new Set(ROAD_LINKS.filter(([a, b]) => a === selectedId || b === selectedId).flat()),
    [selectedId],
  )
  // 勢力ごとの拠点数・人口・生産
  const totals = useMemo(() => {
    const rows = [...FACTIONS.map((f) => ({ id: f.id as string | undefined, name: f.name })), { id: undefined, name: '中立' }]
      .map((f) => {
        const own = cities.filter((c) => c.belongTo === f.id)
        return { ...f, count: own.length, population: sum(own.map((c) => c.population)), production: sum(own.map((c) => c.production)) }
      })
    return rows.filter((r) => r.count > 0)
  }, [cities])
  const fontSize = BOUNDS.width / 60

  return (
    <div className="minimap">
      <svg className="minimap__svg" viewBox={`${BOUNDS.minX} ${BOUNDS.minY} ${BOUNDS.width} ${BOUNDS.height}`}
        preserveAspectRatio="xMidYMid meet">
        {ROAD_LINKS.map(([a, b]) => {
          const pa = POSITIONS.get(a)
          const pb = POSITIONS.get(b)
          if (!pa || !pb) return null
          const active = a === selectedId || b === selectedId
          return <line key={`${a}-${b}`} className={`minimap__road ${active ? 'is-active' : ''}`}
            x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} />
        })}
        {[...POSITIONS].map(([id, pos]) => {
          const city = byId.get(id)
          if (!city) return null
          const r = radiusOf(city.population)
          const selected = id === selectedId
          return (
            <g key={id} className={`minimap__city ${selected ? 'is-selected' : ''} ${neighbours.has(id) && !selected ? 'is-neighbour' : ''}`}
              onClick={() => onSelect(id)}>
              <title>{`${city.name}（${id}）`}</title>
              {selected && <circle cx={pos.x} cy={pos.y} r={r + 5} className="minimap__halo" />}
              <circle cx={pos.x} cy={pos.y} r={r} fill={factionColor(city.belongTo)} className="minimap__dot" />
              <text x={pos.x} y={pos.y + r + fontSize * 1.05} fontSize={fontSize} className="minimap__label" strokeWidth={fontSize * 0.25}>
                {city.name}
              </text>
            </g>
          )
        })}
      </svg>
      <table className="minimap__totals">
        <thead><tr><th>勢力</th><th>拠点</th><th>人口</th><th>生産</th></tr></thead>
        <tbody>
          {totals.map((r) => (
            <tr key={r.name}>
              <td><span className="swatch" style={{ background: factionColor(r.id) }} />{r.name}</td>
              <td>{r.count}</td>
              <td>{r.population.toLocaleString()}</td>
              <td>{r.production.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)
