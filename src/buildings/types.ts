/** 施設データの元データ（buildings/buildings.json）。サーバー（書き出し）とエディタの両方で使う */

import type { Building } from '@game/data/buildings.ts'

/** 元画像（buildings/sources/）のどのセルか */
export interface SheetCell {
  sheet: string
  col: number
  row: number
}

/** ゲームの施設データの sprite（buildings.webp の位置）の代わりに、元画像のセルを持つ */
export type SourceBuilding = Omit<Building, 'sprite'> & {
  /** null: 画像なし */
  sprite: SheetCell | null
}

export const isBuildingId = (id: string) => /^[a-z][a-z0-9_]*$/.test(id)

export const createBuilding = (id: string): SourceBuilding => ({
  id, name: id, description: '', supplies: 300, gold: 100, effects: [], sprite: null,
})

/** アップグレードをたどると id に戻る（循環する）なら、その並び */
export function upgradeCycle(buildings: readonly SourceBuilding[], id: string): string[] | null {
  const map = new Map(buildings.map((b) => [b.id, b]))
  const path = [id]
  for (let next = map.get(id)?.upgradeFrom; next; next = map.get(next)?.upgradeFrom) {
    if (next === id) return [...path, id]
    if (path.includes(next)) return null
    path.push(next)
  }
  return null
}
