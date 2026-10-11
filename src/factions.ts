import { FACTION_LIST } from 'norden-strategy/data'
import { factionColor } from '@game/data/factionColors.ts'

/** 勢力の一覧（norden-strategy）と地図の色（ゲーム本体の src/data/factionColors.ts） */
export const FACTIONS = FACTION_LIST.map((f) => ({ id: f.id, name: f.name, color: factionColor(f.id) }))

export const factionName = (id: string | null | undefined) => (id ? FACTIONS.find((f) => f.id === id)?.name ?? id : '中立')

export { factionColor }
