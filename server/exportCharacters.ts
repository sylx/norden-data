import { existsSync } from 'node:fs'
import { readdir, readFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import type { SheetInfo, SourceCharacter } from '../src/characters/types.ts'
import { ExportError, writeAtomic } from './files.ts'
import { OUTPUT, SHEETS_DIR } from './paths.ts'
import { packCells, readSheet } from './sheets.ts'

/** character-<n>.webp の 1 人分（元画像のセルの半分）と、横に並べる人数 */
const OUT_CELL_W = 512
const OUT_CELL_H = 768
const OUT_COLS = 5
/** 1 枚の行数（WebP は 1 辺 16383px までなので、人数が増えたら次の 1 枚に続ける） */
const OUT_ROWS = 10
const PER_SHEET = OUT_COLS * OUT_ROWS

const sheetFile = (index: number) => path.join(OUTPUT.characterImageDir, `character-${index}.webp`)
const SHEET_FILE_PATTERN = /^character-(\d+)\.webp$/

export interface ExportResult {
  characterCount: number
  /** 画像が未設定で除いたキャラクター */
  skipped: { id: string; name: string }[]
  /** 画像も書き出したとき（画像以外の書き出しでは省く） */
  imageSize?: string
  imageBytes?: number
  files: string[]
}

/** characterData.json の画像の位置（何枚目かとその上のピクセル）と顔の範囲 */
interface ImageInfo {
  sprite: { sheet: number; x: number; y: number }
  faceRect: { x: number; y: number; width: number; height: number }
}

/** {"id": "001", "cityId": "P000"} の形で 1 人 1 行（これまでの characterStart.json と同じ） */
const inlineJson = (obj: Record<string, unknown>) =>
  `{${Object.entries(obj).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ')}}`

/** characterData.json の 1 人分 */
const characterDataOf = (c: SourceCharacter, imageInfo: ImageInfo) => ({
  id: c.id,
  name: c.name,
  type: c.type,
  imageInfo,
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
})

/** characterData.json・characterStart.json を書く（characters は画像のあるキャラクターを ID 順に） */
async function writeData(characters: readonly SourceCharacter[], imageInfo: (c: SourceCharacter) => ImageInfo) {
  const characterData = characters.map((c) => characterDataOf(c, imageInfo(c)))
  const starts = characters.filter((c) => c.start?.cityId).map((c) => inlineJson({
    id: c.id,
    cityId: c.start!.cityId,
    ...(c.start!.factionId ? { factionId: c.start!.factionId } : {}),
    ...(c.start!.isLord && !c.start!.isPrisoner ? { isLord: true } : {}),
    ...(c.start!.isPrisoner ? { isPrisoner: true } : {}),
  }))
  await writeAtomic(OUTPUT.characterData, JSON.stringify(characterData, null, 2) + '\n')
  await writeAtomic(OUTPUT.characterStart, `[\n${starts.map((s) => `  ${s}`).join(',\n')}\n]\n`)
  return characterData.length
}

/** ID 順に並べ、画像が未設定のキャラクターを除く */
function withSprites(characters: readonly SourceCharacter[]) {
  const sorted = [...characters].sort((a, b) => a.id.localeCompare(b.id))
  return {
    withSprite: sorted.filter((c) => c.sprite),
    skipped: sorted.filter((c) => !c.sprite).map(({ id, name }) => ({ id, name })),
  }
}

/**
 * 元データからゲームのデータを書き出す。
 * - character-0.webp, character-1.webp, …: 使っているセルだけを ID 順に横 5 人 × 縦 10 人ずつ並べ直し、半分の大きさにする
 * - characterData.json: 画像の位置は何枚目か（sheet）とその上のピクセル、顔の範囲もその大きさに合わせる
 * - characterStart.json: 配置（start）のあるキャラクター
 * - characterSprite.json: 各 1 枚とセルの大きさ
 */
export async function exportCharacters(characters: readonly SourceCharacter[]): Promise<ExportResult> {
  const { withSprite, skipped } = withSprites(characters)

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
  const packed: { image: Buffer; width: number; height: number }[] = []
  const placed = new Map<string, { sheet: number; x: number; y: number }>()
  for (let start = 0; start < withSprite.length; start += PER_SHEET) {
    const page = withSprite.slice(start, start + PER_SHEET)
    const { image, width, height, positions } = await packCells(SHEETS_DIR, sheets, page.map((c) => c.sprite!),
      { cellWidth: OUT_CELL_W, cellHeight: OUT_CELL_H, cols: OUT_COLS, quality: 90 })
    page.forEach((c, i) => placed.set(c.id, { sheet: packed.length, ...positions[i] }))
    packed.push({ image, width, height })
  }

  for (const [i, { image }] of packed.entries()) await writeAtomic(sheetFile(i), image)
  // 人数が減って使わなくなった 1 枚は消す
  for (const name of await readdir(OUTPUT.characterImageDir)) {
    const index = SHEET_FILE_PATTERN.exec(name)?.[1]
    if (index !== undefined && Number(index) >= packed.length) await unlink(path.join(OUTPUT.characterImageDir, name))
  }
  const characterCount = await writeData(withSprite, (c) => {
    const sheet = sheets.get(c.sprite!.sheet)!
    const sx = OUT_CELL_W / sheet.cellWidth
    const sy = OUT_CELL_H / sheet.cellHeight
    return {
      sprite: placed.get(c.id)!,
      faceRect: { x: c.faceRect.x * sx, y: c.faceRect.y * sy, width: c.faceRect.width * sx, height: c.faceRect.height * sy },
    }
  })
  const sprite = { cellWidth: OUT_CELL_W, cellHeight: OUT_CELL_H, sheets: packed.map(({ width, height }) => ({ width, height })) }
  await writeAtomic(OUTPUT.characterSprite, JSON.stringify(sprite, null, 2) + '\n')

  return {
    characterCount,
    skipped,
    imageSize: `${packed.length}枚: ${packed.map(({ width, height }) => `${width}×${height}`).join('・')}`,
    imageBytes: packed.reduce((sum, { image }) => sum + image.length, 0),
    files: [...packed.map((_, i) => sheetFile(i)), OUTPUT.characterData, OUTPUT.characterStart, OUTPUT.characterSprite],
  }
}

/**
 * 画像以外を書き出す: characterData.json（能力・略歴など）と characterStart.json だけを書き、character-<n>.webp と
 * characterSprite.json はそのままにする。元画像が無くても書き出せる。
 * 画像の位置と顔の範囲は、いまのゲームの characterData.json（前回「ゲームに書き出す」で作ったもの）のものを使うので、
 * 画像のセルや顔の範囲を変えたときは「ゲームに書き出す」を使う。前回の書き出しに無いキャラクターがいると書き出さない
 */
export async function exportCharacterData(characters: readonly SourceCharacter[]): Promise<ExportResult> {
  const { withSprite, skipped } = withSprites(characters)
  if (withSprite.length === 0) throw new ExportError('画像が設定されたキャラクターがいません')
  let current: { id: string; imageInfo: ImageInfo }[]
  try {
    current = JSON.parse(await readFile(OUTPUT.characterData, 'utf8'))
  } catch {
    throw new ExportError(`${OUTPUT.characterData} が読めません。先に「ゲームに書き出す」で画像ごと書き出してください`)
  }
  const images = new Map(current.map((c) => [c.id, c.imageInfo]))
  const missing = withSprite.filter((c) => !images.has(c.id))
  if (missing.length > 0) {
    throw new ExportError(`画像がまだ書き出されていません（「ゲームに書き出す」を使ってください）: ${missing.map((c) => `${c.id} ${c.name}`).join('、')}`)
  }
  const characterCount = await writeData(withSprite, (c) => images.get(c.id)!)
  return { characterCount, skipped, files: [OUTPUT.characterData, OUTPUT.characterStart] }
}
