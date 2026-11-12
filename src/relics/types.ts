/** 遺物データの元データ（relics/relics.json）。サーバー（書き出し）とエディタの両方で使う */

import type { Relic } from '@game/data/relics.ts'
import type { SheetCell } from '../buildings/types.ts'

/** ゲームの遺物データの sprite・brokenSprite（relics.webp の位置）の代わりに、元画像のセルを持つ */
export type SourceRelic = Omit<Relic, 'sprite' | 'brokenSprite'> & {
  /** 修復済みの画像。null: 画像なし */
  sprite: SheetCell | null
  /** 壊れた状態の画像。null: 画像なし（壊れた状態が無い遺物も） */
  brokenSprite?: SheetCell | null
}

export const isRelicId = (id: string) => /^[a-z][a-z0-9_]*$/.test(id)

/** 壊れた状態のある遺物 */
export const createRelic = (id: string): SourceRelic => ({
  id,
  name: id,
  brokenName: `壊れた${id}`,
  description: '',
  rarity: 'C',
  use: 'equipment',
  equipment: { wearer: 'nonMagician' },
  dismantlePoints: 300,
  repair: { supplies: 400, gold: 150 },
  sprite: null,
  brokenSprite: null,
})

/**
 * 技術の参照切れと、壊れた状態のそろっていない遺物の問題（ゲームの relicDataProblems のうち、書き出しのサーバーでもする検査）。
 * 壊れた状態が無い遺物には生産が要る。効果（装備・召喚・施設）の検査（ゲームの relicEffectProblems）はエディタだけでする
 */
export function relicProblems(relics: readonly SourceRelic[], techIds: readonly string[]): string[] {
  const ids = new Set(techIds)
  const problems: string[] = []
  for (const r of relics) {
    for (const cost of [r.repair, r.production]) {
      if (cost?.tech && !ids.has(cost.tech)) problems.push(`${r.id} ${r.name}: 技術 ${cost.tech} がありません`)
    }
    const broken = [r.brokenName, r.dismantlePoints, r.repair].filter((value) => value !== undefined)
    if (broken.length > 0 && broken.length < 3) problems.push(`${r.id} ${r.name}: 壊れた状態の名前・解体・修復がそろっていません`)
    if (broken.length === 0 && !r.production) problems.push(`${r.id} ${r.name}: 壊れた状態も生産もありません`)
  }
  return problems
}

/** 元のセルの一覧（修復済み、壊れた状態の順）。同じ遺物でも 2 枚までで、画像の無いものは入らない */
export const relicCells = (r: SourceRelic): SheetCell[] => [r.sprite, r.brokenSprite].filter((c): c is SheetCell => Boolean(c))
