import { FACTION_LIST, factionColor as gameFactionColor } from '@game/data/faction.ts'
import type { SourceCharacter } from './characters/types'
import { MERCENARY_ID } from './factions/types'

/** 勢力の一覧と地図の色（ゲーム本体の src/data/factionData.json。勢力データのタブで保存すると読み直す） */
export const FACTIONS = FACTION_LIST.map((f) => ({ id: f.id, name: f.name, color: gameFactionColor(f.id) }))

/** 勢力を指定していない傭兵のまとまり。エディタの表示だけで、ゲームの勢力ではない */
export const MERCENARY = { id: MERCENARY_ID, name: '傭兵', color: '#7a6fb0' } as const

export const factionName = (id: string | null | undefined) =>
  id === MERCENARY.id ? MERCENARY.name : id ? FACTIONS.find((f) => f.id === id)?.name ?? id : '中立'

export const factionColor = (id: string | null | undefined) => (id === MERCENARY.id ? MERCENARY.color : gameFactionColor(id))

/** 騎士の勢力。指定がなければ、傭兵は傭兵、それ以外（捕虜・放浪）は所属なし（undefined）。配置しない騎士も undefined */
export function characterFaction(c: SourceCharacter): string | undefined {
  if (!c.start) return undefined
  return c.start.factionId ?? (c.mercenaryInfo && !c.start.isPrisoner ? MERCENARY.id : undefined)
}
