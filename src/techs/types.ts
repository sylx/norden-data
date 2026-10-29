/** 技術データの元データ（techs/techs.json）。サーバー（書き出し）とエディタの両方で使う */

import type { Tech } from '@game/data/techs.ts'
import type { SheetCell } from '../buildings/types.ts'

/** ゲームの技術データの sprite（techs.webp の位置）の代わりに、元画像のセルを持つ */
export type SourceTech = Omit<Tech, 'sprite'> & {
  /** null: 画像なし */
  sprite: SheetCell | null
}

export const isTechId = (id: string) => /^[a-z][a-z0-9_]*$/.test(id)

export const createTech = (id: string, branch: Tech['branch'] = 'physical'): SourceTech => ({
  id, name: id, description: '', branch, cost: 100, requires: [], effects: [], sprite: null,
})

/** 前提をたどると id に戻る（循環する）なら、その並び */
export function requiresCycle(techs: readonly Pick<SourceTech, 'id' | 'requires'>[], id: string): string[] | null {
  const map = new Map(techs.map((t) => [t.id, t]))
  const seen = new Set<string>()
  const walk = (current: string, path: string[]): string[] | null => {
    for (const next of map.get(current)?.requires ?? []) {
      if (next === id) return [...path, id]
      if (seen.has(next)) continue
      seen.add(next)
      const found = walk(next, [...path, next])
      if (found) return found
    }
    return null
  }
  return walk(id, [id])
}

/** 前提の技術が無い・前提が循環している技術の問題（ゲームの techDataProblems と同じ検査） */
export function techProblems(techs: readonly Pick<SourceTech, 'id' | 'name' | 'requires'>[]): string[] {
  const ids = new Set(techs.map((t) => t.id))
  const problems: string[] = []
  for (const t of techs) {
    for (const r of t.requires) if (!ids.has(r)) problems.push(`${t.id} ${t.name}: 前提 ${r} がありません`)
    const cycle = requiresCycle(techs, t.id)
    if (cycle) problems.push(`前提が循環しています: ${cycle.join(' → ')}`)
  }
  return problems
}

/** 前提からの段（根は 0、前提の一番深いものの次）。循環しているものは入らない */
export function techDepths(techs: readonly Pick<SourceTech, 'id' | 'requires'>[]): Map<string, number> {
  const map = new Map(techs.map((t) => [t.id, t]))
  const depths = new Map<string, number>()
  const visiting = new Set<string>()
  const depth = (id: string): number | undefined => {
    if (depths.has(id)) return depths.get(id)
    const tech = map.get(id)
    if (!tech || visiting.has(id)) return undefined
    visiting.add(id)
    let deepest = -1
    for (const r of tech.requires) {
      const d = depth(r)
      if (d === undefined) {
        visiting.delete(id)
        return undefined
      }
      deepest = Math.max(deepest, d)
    }
    visiting.delete(id)
    depths.set(id, deepest + 1)
    return deepest + 1
  }
  for (const t of techs) depth(t.id)
  return depths
}
