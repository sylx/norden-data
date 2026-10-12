import { FACTION_LIST } from 'norden-strategy/data'
import { factionColor as gameFactionColor } from '@game/data/factionColors.ts'
import type { SourceCharacter } from './characters/types'

/** 勢力の一覧（norden-strategy）と地図の色（ゲーム本体の src/data/factionColors.ts） */
export const FACTIONS = FACTION_LIST.map((f) => ({ id: f.id, name: f.name, color: factionColor(f.id) }))

/** 勢力を指定していない傭兵のまとまり。エディタの表示だけで、ゲームの勢力ではない */
export const MERCENARY = { id: 'mercenary', name: '傭兵', color: '#7a6fb0' } as const

export const factionName = (id: string | null | undefined) =>
  id === MERCENARY.id ? MERCENARY.name : id ? FACTIONS.find((f) => f.id === id)?.name ?? id : '中立'

export const factionColor = (id: string | null | undefined) => (id === MERCENARY.id ? MERCENARY.color : gameFactionColor(id))

/** 騎士の勢力。指定がなければ、傭兵は傭兵、それ以外は配置先の都市の勢力。配置しない騎士は undefined */
export function characterFaction(c: SourceCharacter, cityOwner: (cityId: string) => string | undefined): string | undefined {
  if (!c.start) return undefined
  return c.start.factionId ?? (c.mercenaryInfo ? MERCENARY.id : cityOwner(c.start.cityId))
}
