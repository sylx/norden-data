import { existsSync } from 'node:fs'
import path from 'node:path'
import type { SheetInfo } from '../src/characters/types.ts'
import { isBuildingId, upgradeCycle, type SourceBuilding } from '../src/buildings/types.ts'
import { ExportError, writeAtomic } from './files.ts'
import { BUILDING_SHEETS_DIR, OUTPUT } from './paths.ts'
import { packCells, readSheet } from './sheets.ts'

/** buildings.webp の 1 施設分（元画像のセル 1024×1536 の 1/4）と、横に並べる数 */
const OUT_CELL_W = 256
const OUT_CELL_H = 384
const OUT_COLS = 5

export interface ExportResult {
  buildingCount: number
  /** 画像が未設定の施設 */
  noImage: { id: string; name: string }[]
  imageSize: string
  imageBytes: number
  files: string[]
}

const cellKey = (c: { sheet: string; col: number; row: number }) => `${c.sheet}:${c.col}:${c.row}`

/**
 * 元データからゲームのデータを書き出す。
 * - buildings.webp: 使っているセルだけを一覧の順に横 5 個で並べ直し、1/4 の大きさにする（同じセルは 1 つにまとめる）
 * - buildingData.json: 一覧の順。画像の位置（sprite）は buildings.webp 上のピクセル
 * - buildingSprite.json: buildings.webp とセルの大きさ
 */
export async function exportBuildings(buildings: readonly SourceBuilding[]): Promise<ExportResult> {
  const ids = new Set(buildings.map((b) => b.id))
  for (const b of buildings) {
    if (!isBuildingId(b.id)) throw new ExportError(`施設の ID は英小文字・数字・_ にしてください: ${b.id}`)
    if (b.upgradeFrom && !ids.has(b.upgradeFrom)) throw new ExportError(`${b.id} ${b.name}: アップグレード元 ${b.upgradeFrom} がありません`)
    const cycle = upgradeCycle(buildings, b.id)
    if (cycle) throw new ExportError(`アップグレードが循環しています: ${cycle.join(' → ')}`)
  }

  const withSprite = buildings.filter((b) => b.sprite)
  const sheetFiles = [...new Set(withSprite.map((b) => b.sprite!.sheet))]
  const missing = sheetFiles.filter((f) => !existsSync(path.join(BUILDING_SHEETS_DIR, f)))
  if (missing.length > 0) throw new ExportError(`元画像がありません（buildings/sources/ に置いてください）: ${missing.join(', ')}`)

  const sheets = new Map<string, SheetInfo>()
  for (const f of sheetFiles) sheets.set(f, await readSheet(BUILDING_SHEETS_DIR, f))
  for (const b of withSprite) {
    const sheet = sheets.get(b.sprite!.sheet)!
    if (b.sprite!.col >= sheet.cols || b.sprite!.row >= sheet.rows) {
      throw new ExportError(`${b.id} ${b.name}: ${sheet.file} は ${sheet.cols}×${sheet.rows} なのに (${b.sprite!.col}, ${b.sprite!.row}) が指定されています`)
    }
  }

  const cells = [...new Map(withSprite.map((b) => [cellKey(b.sprite!), b.sprite!])).values()]
  const { image, width, height, positions } = await packCells(BUILDING_SHEETS_DIR, sheets, cells,
    { cellWidth: OUT_CELL_W, cellHeight: OUT_CELL_H, cols: OUT_COLS, quality: 85 })
  const placed = new Map(cells.map((c, i) => [cellKey(c), positions[i]]))

  const buildingData = buildings.map((b) => ({
    id: b.id,
    name: b.name,
    description: b.description,
    supplies: b.supplies,
    gold: b.gold,
    ...(b.requiredTags?.length ? { requiredTags: b.requiredTags } : {}),
    ...(b.upgradeFrom ? { upgradeFrom: b.upgradeFrom } : {}),
    ...(b.requiredRelic ? { requiredRelic: b.requiredRelic } : {}),
    effects: b.effects,
    ...(b.sprite ? { sprite: placed.get(cellKey(b.sprite))! } : {}),
  }))

  await writeAtomic(OUTPUT.buildingImage, image)
  await writeAtomic(OUTPUT.buildingData, JSON.stringify(buildingData, null, 2) + '\n')
  await writeAtomic(OUTPUT.buildingSprite, JSON.stringify({ width, height, cellWidth: OUT_CELL_W, cellHeight: OUT_CELL_H }, null, 2) + '\n')

  return {
    buildingCount: buildingData.length,
    noImage: buildings.filter((b) => !b.sprite).map(({ id, name }) => ({ id, name })),
    imageSize: `${width}×${height}`,
    imageBytes: image.length,
    files: [OUTPUT.buildingImage, OUTPUT.buildingData, OUTPUT.buildingSprite],
  }
}
