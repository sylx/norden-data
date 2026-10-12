import { useMemo } from 'react'
import { PLACES, ROAD_LINKS } from 'norden-strategy/data'
import type { City } from '@game/data/city.ts'
import { CHARACTER_TYPES, CHARACTER_TYPE_LABELS, type CharacterType, type SourceCharacter } from '../characters/types'
import { FACTIONS, MERCENARY, characterFaction, factionColor } from '../factions'

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

export function MiniMap({ cities, characters = [], selectedId, onSelect, showTotals = true }: {
  cities: readonly City[]
  /** 集計表の騎士数に使う */
  characters?: readonly SourceCharacter[]
  selectedId: string
  onSelect: (id: string) => void
  /** 勢力ごとの集計表を出す */
  showTotals?: boolean
}) {
  const byId = useMemo(() => new Map(cities.map((c) => [c.id, c])), [cities])
  const neighbours = useMemo(
    () => new Set(ROAD_LINKS.filter(([a, b]) => a === selectedId || b === selectedId).flat()),
    [selectedId],
  )
  // 勢力ごとの拠点数・人口・生産・騎士数（傭兵は別に数える）・クラスごとの人数（傭兵も含む）と、その合計
  const totals = useMemo(() => {
    const placed = characters.filter((c) => c.start && byId.has(c.start.cityId))
      .map((c) => ({ factionId: characterFaction(c, (id) => byId.get(id)?.belongTo), mercenary: !!c.mercenaryInfo, type: c.type }))
    const rows = [
      ...FACTIONS.map((f) => ({ id: f.id as string | undefined, name: f.name })),
      { id: undefined, name: '中立' },
      { id: MERCENARY.id, name: MERCENARY.name },
    ]
      .map((f) => {
        const own = cities.filter((c) => c.belongTo === f.id)
        const members = placed.filter((c) => c.factionId === f.id)
        return {
          ...f,
          count: own.length,
          population: sum(own.map((c) => c.population)),
          production: sum(own.map((c) => c.production)),
          knights: members.filter((c) => !c.mercenary).length,
          mercenaries: members.filter((c) => c.mercenary).length,
          types: countTypes(members),
        }
      })
      .filter((r) => r.count > 0 || r.knights > 0 || r.mercenaries > 0)
    const total = {
      id: 'total',
      name: '計',
      count: sum(rows.map((r) => r.count)),
      population: sum(rows.map((r) => r.population)),
      production: sum(rows.map((r) => r.production)),
      knights: sum(rows.map((r) => r.knights)),
      mercenaries: sum(rows.map((r) => r.mercenaries)),
      types: Object.fromEntries(CHARACTER_TYPES.map((t) => [t, sum(rows.map((r) => r.types[t]))])) as Record<CharacterType, number>,
    }
    return { rows, total }
  }, [cities, characters, byId])
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
      {showTotals && <table className="minimap__totals">
        <thead>
          <tr className="minimap__group">
            <th colSpan={6} /><th colSpan={CHARACTER_TYPES.length} className="minimap__sep">クラス</th>
          </tr>
          <tr>
            <th>勢力</th><th>拠点</th><th>人口</th><th>生産</th><th>騎士</th><th>傭兵</th>
            {CHARACTER_TYPES.map((t, i) => <th key={t} className={i === 0 ? 'minimap__sep' : ''}>{CHARACTER_TYPE_LABELS[t]}</th>)}
          </tr>
        </thead>
        <tbody>
          {[...totals.rows, totals.total].map((r) => (
            <tr key={r.name} className={r === totals.total ? 'minimap__total' : ''}>
              <td>{r !== totals.total && <span className="swatch" style={{ background: factionColor(r.id) }} />}{r.name}</td>
              <td>{r.count}</td>
              <td>{r.population.toLocaleString()}</td>
              <td>{r.production.toLocaleString()}</td>
              <td>{r.knights}</td>
              <td>{r.mercenaries}</td>
              {CHARACTER_TYPES.map((t, i) => <td key={t} className={i === 0 ? 'minimap__sep' : ''}>{r.types[t] || ''}</td>)}
            </tr>
          ))}
        </tbody>
      </table>}
    </div>
  )
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)

const countTypes = (members: readonly { type: CharacterType }[]) =>
  Object.fromEntries(CHARACTER_TYPES.map((t) => [t, members.filter((c) => c.type === t).length])) as Record<CharacterType, number>
