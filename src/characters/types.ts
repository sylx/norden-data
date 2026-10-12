/** 騎士データの元データ（characters/characters.json）。サーバー（書き出し）とエディタの両方で使う */

import type { PersonalityTag, VoiceToneId } from '@game/data/characterVoice.ts'

export const CHARACTER_TYPES = ['knight', 'scholar', 'politician', 'magician', 'hunter'] as const
export type CharacterType = (typeof CHARACTER_TYPES)[number]

export const CHARACTER_TYPE_LABELS: Readonly<Record<CharacterType, string>> = {
  knight: '騎士',
  scholar: '学者',
  politician: '政治家',
  magician: '魔法使い',
  hunter: '狩人',
}

export const RELATION_TYPES = ['father', 'mother', 'son', 'daughter', 'brother', 'sister', 'married', 'best_friend'] as const
export type RelationType = (typeof RELATION_TYPES)[number]

export const RELATION_LABELS: Readonly<Record<RelationType, string>> = {
  father: '父',
  mother: '母',
  son: '息子',
  daughter: '娘',
  brother: '兄弟',
  sister: '姉妹',
  married: '配偶者',
  best_friend: '親友',
}

export const STAT_KEYS = [
  ['politics', '政治'],
  ['intelligence', '知力'],
  ['leadership', '統率'],
  ['strength', '武力'],
  ['charm', '魅力'],
] as const

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Relation {
  relation: RelationType
  characterId: string
}

/** ゲーム開始時の配置（ルートの characterStart.json の 1 行） */
export interface CharacterStart {
  cityId: string
  /** 省略: 都市の勢力 */
  factionId?: string
  /** 都市の領主 */
  isLord?: boolean
}

export interface SourceCharacter {
  /** '001'.. */
  id: string
  name: string
  type: CharacterType
  gender?: 'male' | 'female'
  /** 口調 */
  voiceTone?: VoiceToneId
  /** 性格。PERSONALITY_AXES の軸ごとに 1 つまで */
  personality?: PersonalityTag[]
  /** 元画像（characters/sheets/）のどのセルか。null: 未設定（書き出しでは除く） */
  sprite: { sheet: string; col: number; row: number } | null
  /** 顔の範囲。セルの左上からの、元画像のピクセル */
  faceRect: Rect
  politics: number
  intelligence: number
  leadership: number
  strength: number
  charm: number
  biography?: string
  mercenaryInfo?: { name: string; fee: number }
  relations?: Relation[]
  /** 勢力の当主 */
  isPatriarch?: boolean
  /** null: 配置しない（ゲームに出てこない） */
  start: CharacterStart | null
}

/** 元画像の 1 枚。セルの並びは画像の大きさから決める（server/sheets.ts） */
export interface SheetInfo {
  file: string
  width: number
  height: number
  cols: number
  rows: number
  cellWidth: number
  cellHeight: number
  /** セルの間の余白 */
  padding: number
}

/** セルの左上（元画像のピクセル） */
export const cellOrigin = (sheet: SheetInfo, col: number, row: number) => ({
  x: col * (sheet.cellWidth + sheet.padding),
  y: row * (sheet.cellHeight + sheet.padding),
})

/** セルの範囲（元画像のピクセル） */
export const cellRect = (sheet: SheetInfo, col: number, row: number): Rect =>
  ({ ...cellOrigin(sheet, col, row), width: sheet.cellWidth, height: sheet.cellHeight })

export function createCharacter(id: string): SourceCharacter {
  return {
    id,
    name: `キャラクター${id}`,
    type: 'knight',
    sprite: null,
    faceRect: { x: 256, y: 128, width: 512, height: 512 },
    politics: 50,
    intelligence: 50,
    leadership: 50,
    strength: 50,
    charm: 50,
    start: null,
  }
}

/**
 * 相手から見た関係。A の relation（相手 B が A の何か）を B から見ると、A が B の何かになる。
 * 父母・子・兄弟姉妹は A の性別で決める（未設定は男性として扱う）
 */
export function reverseRelation(relation: RelationType, gender: SourceCharacter['gender']): RelationType {
  const female = gender === 'female'
  switch (relation) {
    case 'father': case 'mother': return female ? 'daughter' : 'son'
    case 'son': case 'daughter': return female ? 'mother' : 'father'
    case 'brother': case 'sister': return female ? 'sister' : 'brother'
    default: return relation
  }
}

/** others の一人ひとりの、id への関係を、id から見た関係の逆にそろえる。id から関係がなければ外す */
function syncReverse(list: SourceCharacter[], id: string, others: ReadonlySet<string>): SourceCharacter[] {
  const self = list.find((c) => c.id === id)
  if (!self) return list
  return list.map((c) => {
    if (c.id === id || !others.has(c.id)) return c
    const rel = self.relations?.find((r) => r.characterId === c.id)
    const rest = (c.relations ?? []).filter((r) => r.characterId !== id)
    const next = rel ? [...rest, { relation: reverseRelation(rel.relation, self.gender), characterId: id }] : rest
    return { ...c, relations: next.length ? next : undefined }
  })
}

/** id の関係を relations にし、関係を付けた・変えた・外した相手の側もそろえる */
export function setRelations(list: SourceCharacter[], id: string, relations: Relation[]): SourceCharacter[] {
  const before = list.find((c) => c.id === id)?.relations ?? []
  const toward = (rels: Relation[], other: string) => rels.find((r) => r.characterId === other)?.relation
  const changed = new Set([...before, ...relations].map((r) => r.characterId)
    .filter((other) => other && toward(before, other) !== toward(relations, other)))
  const next = list.map((c) => (c.id === id ? { ...c, relations: relations.length ? relations : undefined } : c))
  return syncReverse(next, id, changed)
}

/** id の性別を変え、相手の側の関係（父/母など）もそろえる */
export function setGender(list: SourceCharacter[], id: string, gender: SourceCharacter['gender']): SourceCharacter[] {
  const next = list.map((c) => (c.id === id ? { ...c, gender } : c))
  const self = next.find((c) => c.id === id)
  return syncReverse(next, id, new Set(self?.relations?.map((r) => r.characterId)))
}

export function nextCharacterId(characters: readonly SourceCharacter[]): string {
  const max = Math.max(0, ...characters.map((c) => parseInt(c.id, 10) || 0))
  return String(max + 1).padStart(3, '0')
}
