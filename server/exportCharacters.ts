import { existsSync } from 'node:fs'
import path from 'node:path'
import type { SheetInfo, SourceCharacter } from '../src/characters/types.ts'
import { ExportError, writeAtomic } from './files.ts'
import { OUTPUT, SHEETS_DIR } from './paths.ts'
import { packCells, readSheet } from './sheets.ts'

/** character.webp の 1 人分（元画像のセルの半分）と、横に並べる人数 */
const OUT_CELL_W = 512
const OUT_CELL_H = 768
const OUT_COLS = 5

export interface ExportResult {
  characterCount: number
  /** 画像が未設定で除いたキャラクター */
  skipped: { id: string; name: string }[]
  imageSize: string
  imageBytes: number
  files: string[]
}

/** {"id": "001", "cityId": "P000"} の形で 1 人 1 行（これまでの characterStart.json と同じ） */
const inlineJson = (obj: Record<string, unknown>) =>
  `{${Object.entries(obj).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ')}}`

/**
 * 元データからゲームのデータを書き出す。
 * - character.webp: 使っているセルだけを ID 順に横 5 人で並べ直し、半分の大きさにする
 * - characterData.json: 画像の位置は character.webp 上のピクセル、顔の範囲もその大きさに合わせる
 * - characterStart.json: 配置（start）のあるキャラクター
 * - characterSprite.json: character.webp とセルの大きさ
 */
export async function exportCharacters(characters: readonly SourceCharacter[]): Promise<ExportResult> {
  const sorted = [...characters].sort((a, b) => a.id.localeCompare(b.id))
  const withSprite = sorted.filter((c) => c.sprite)
  const skipped = sorted.filter((c) => !c.sprite).map(({ id, name }) => ({ id, name }))

  const sheetFiles = [...new Set(withSprite.map((c) => c.sprite!.sheet))]
  const missing = sheetFiles.filter((f) => !existsSync(path.join(SHEETS_DIR, f)))
  if (missing.length > 0) throw new ExportError(`元画像がありません（characters/sheets/ に置いてください）: ${missing.join(', ')}`)
  if (withSprite.length === 0) throw new ExportError('画像が設定されたキャラクターがいません')

  const sheets = new Map<string, SheetInfo>()
  for (const f of sheetFiles) sheets.set(f, await readSheet(SHEETS_DIR, f))
  for (const c of withSprite) {
    const sheet = sheets.get(c.sprite!.sheet)!
    if (c.sprite!.col >= sheet.cols || c.sprite!.row >= sheet.rows) {
      throw new ExportError(`${c.id} ${c.name}: ${sheet.file} は ${sheet.cols}×${sheet.rows} なのに (${c.sprite!.col}, ${c.sprite!.row}) が指定されています`)
    }
  }

  // 使うセルを ID 順に並べ直す
  const { image, width, height, positions } = await packCells(SHEETS_DIR, sheets, withSprite.map((c) => c.sprite!),
    { cellWidth: OUT_CELL_W, cellHeight: OUT_CELL_H, cols: OUT_COLS, quality: 90 })
  const placed = new Map(withSprite.map((c, i) => [c.id, positions[i]]))

  const characterData = withSprite.map((c) => {
    const sheet = sheets.get(c.sprite!.sheet)!
    const sx = OUT_CELL_W / sheet.cellWidth
    const sy = OUT_CELL_H / sheet.cellHeight
    return {
      id: c.id,
      name: c.name,
      type: c.type,
      imageInfo: {
        sprite: placed.get(c.id)!,
        faceRect: { x: c.faceRect.x * sx, y: c.faceRect.y * sy, width: c.faceRect.width * sx, height: c.faceRect.height * sy },
      },
      politics: c.politics,
      intelligence: c.intelligence,
      leadership: c.leadership,
      strength: c.strength,
      charm: c.charm,
      ...(c.gender ? { gender: c.gender } : {}),
      ...(c.voiceTone ? { voiceTone: c.voiceTone } : {}),
      ...(c.personality?.length ? { personality: c.personality } : {}),
      ...(c.biography ? { biography: c.biography } : {}),
      ...(c.mercenaryInfo ? { mercenaryInfo: c.mercenaryInfo } : {}),
      ...(c.relations?.length ? { relations: c.relations } : {}),
      ...(c.isPatriarch ? { isPatriarch: true } : {}),
    }
  })

  const starts = withSprite.filter((c) => c.start?.cityId).map((c) => inlineJson({
    id: c.id,
    cityId: c.start!.cityId,
    ...(c.start!.factionId ? { factionId: c.start!.factionId } : {}),
    ...(c.start!.isLord ? { isLord: true } : {}),
  }))

  await writeAtomic(OUTPUT.characterImage, image)
  await writeAtomic(OUTPUT.characterData, JSON.stringify(characterData, null, 2) + '\n')
  await writeAtomic(OUTPUT.characterStart, `[\n${starts.map((s) => `  ${s}`).join(',\n')}\n]\n`)
  await writeAtomic(OUTPUT.characterSprite, JSON.stringify({ width, height, cellWidth: OUT_CELL_W, cellHeight: OUT_CELL_H }, null, 2) + '\n')

  return {
    characterCount: characterData.length,
    skipped,
    imageSize: `${width}×${height}`,
    imageBytes: image.length,
    files: [OUTPUT.characterImage, OUTPUT.characterData, OUTPUT.characterStart, OUTPUT.characterSprite],
  }
}
