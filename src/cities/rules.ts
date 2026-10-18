import type { City } from '@game/data/city.ts'
import {
  FIXED_SLOTS, INITIAL_MORALE, INITIAL_SUPPLIES_PER_PRODUCTION, INITIAL_TROOPS_PER_PRODUCTION, TIER_POPULATION, TIER_SLOTS,
} from '@game/game/economy/balance.ts'

/** 拠点の初期値の既定と Tier（ゲームの src/game/economy/ と同じ決まり） */

export { INITIAL_MORALE, INITIAL_SUPPLIES_PER_PRODUCTION, INITIAL_TROOPS_PER_PRODUCTION }

export const tierOf = (population: number): 1 | 2 | 3 =>
  population >= TIER_POPULATION[1] ? 3 : population >= TIER_POPULATION[0] ? 2 : 1

export const slotsOf = (tier: 1 | 2 | 3) => TIER_SLOTS[tier]

/** 施設のスロット数（聖地・要塞（固定の絵）は Tier によらず FIXED_SLOTS） */
export const citySlots = (city: City) => (city.image ? FIXED_SLOTS : slotsOf(tierOf(city.population)))

/** 初期の兵数（省略なら 生産 × INITIAL_TROOPS_PER_PRODUCTION） */
export const troopsOf = (city: City) => city.troops ?? city.production * INITIAL_TROOPS_PER_PRODUCTION
