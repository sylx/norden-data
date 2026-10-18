/** 勢力データ（ルートの src/data/factionData.json）の ID と新しい勢力。サーバー（検査）とエディタの両方で使う */

import type { Faction } from '@game/data/faction.ts'

/** 騎士データで傭兵のまとまりに使う ID（勢力には使えない） */
export const MERCENARY_ID = 'mercenary'

export const isFactionId = (id: string) => /^[a-z][a-z0-9_]*$/.test(id) && id !== MERCENARY_ID

export const createFaction = (id: string): Faction => ({ id, name: id, emblem: 1, patriarchLabel: '当主', color: '#8a8a80' })
