import { existsSync } from 'node:fs'
import path from 'node:path'
import type { SheetInfo } from '../src/characters/types.ts'
import { isTechId, techProblems, type SourceTech } from '../src/techs/types.ts'
import { ExportError, writeAtomic } from './files.ts'
import { OUTPUT, TECH_SHEETS_DIR } from './paths.ts'
import { packCells, readSheet } from './sheets.ts'

/** techs.webp の 1 技術分（施設と同じく元画像のセル 1024×1536 の 1/4）と、横に並べる数 */
const OUT_CELL_W = 256
const OUT_CELL_H = 384
const OUT_COLS = 5

export interface ExportResult {
  techCount: number
  /** 画像が未設定の技術 */
  noImage: { id: string; name: string }[]
  imageSize: string
  imageBytes: number
  files: string[]
}

const cellKey = (c: { sheet: string; col: number; row: number }) => `${c.sheet}:${c.col}:${c.row}`

/**
 * 元データからゲームのデータを書き出す（施設の書き出しと同じ流れ）。
 * - techs.webp: 使っているセルだけを一覧の順に横 5 個で並べ直し、1/4 の大きさにする（同じセルは 1 つにまとめる）
 * - techData.json: 一覧の順。画像の位置（sprite）は techs.webp 上のピクセル
 * - techSprite.json: techs.webp とセルの大きさ
 * 前提の技術が無い・循環しているときは書き出さない
 */
export async function exportTechs(techs: readonly SourceTech[]): Promise<ExportResult> {
  for (const t of techs) if (!isTechId(t.id)) throw new ExportError(`技術の ID は英小文字・数字・_ にしてください: ${t.id}`)
  const problems = techProblems(techs)
  if (problems.length > 0) throw new ExportError(problems.join('\n'))

  const withSprite = techs.filter((t) => t.sprite)
  const sheetFiles = [...new Set(withSprite.map((t) => t.sprite!.sheet))]
  const missing = sheetFiles.filter((f) => !existsSync(path.join(TECH_SHEETS_DIR, f)))
  if (missing.length > 0) throw new ExportError(`元画像がありません（techs/sources/ に置いてください）: ${missing.join(', ')}`)

  const sheets = new Map<string, SheetInfo>()
  for (const f of sheetFiles) sheets.set(f, await readSheet(TECH_SHEETS_DIR, f))
  for (const t of withSprite) {
    const sheet = sheets.get(t.sprite!.sheet)!
    if (t.sprite!.col >= sheet.cols || t.sprite!.row >= sheet.rows) {
      throw new ExportError(`${t.id} ${t.name}: ${sheet.file} は ${sheet.cols}×${sheet.rows} なのに (${t.sprite!.col}, ${t.sprite!.row}) が指定されています`)
    }
  }

  const cells = [...new Map(withSprite.map((t) => [cellKey(t.sprite!), t.sprite!])).values()]
  const { image, width, height, positions } = await packCells(TECH_SHEETS_DIR, sheets, cells,
    { cellWidth: OUT_CELL_W, cellHeight: OUT_CELL_H, cols: OUT_COLS, quality: 85 })
  const placed = new Map(cells.map((c, i) => [cellKey(c), positions[i]]))

  const techData = techs.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    branch: t.branch,
    cost: t.cost,
    requires: t.requires,
    ...(t.alignWith ? { alignWith: t.alignWith } : {}),
    effects: t.effects,
    ...(t.sprite ? { sprite: placed.get(cellKey(t.sprite))! } : {}),
  }))

  await writeAtomic(OUTPUT.techImage, image)
  await writeAtomic(OUTPUT.techData, JSON.stringify(techData, null, 2) + '\n')
  await writeAtomic(OUTPUT.techSprite, JSON.stringify({ width, height, cellWidth: OUT_CELL_W, cellHeight: OUT_CELL_H }, null, 2) + '\n')

  return {
    techCount: techData.length,
    noImage: techs.filter((t) => !t.sprite).map(({ id, name }) => ({ id, name })),
    imageSize: `${width}×${height}`,
    imageBytes: image.length,
    files: [OUTPUT.techImage, OUTPUT.techData, OUTPUT.techSprite],
  }
}
