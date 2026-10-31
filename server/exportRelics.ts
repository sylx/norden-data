import { existsSync } from 'node:fs'
import path from 'node:path'
import type { SheetInfo } from '../src/characters/types.ts'
import { isRelicId, relicCells, relicProblems, type SourceRelic } from '../src/relics/types.ts'
import { ExportError, writeAtomic } from './files.ts'
import { OUTPUT, RELIC_SHEETS_DIR } from './paths.ts'
import { packCells, readSheet } from './sheets.ts'

/** relics.webp の 1 枚分（技術と同じ大きさ）と、横に並べる数 */
const OUT_CELL_W = 256
const OUT_CELL_H = 384
const OUT_COLS = 5

export interface ExportResult {
  relicCount: number
  /** 画像が未設定の遺物（壊れた状態が無い遺物の壊れた画像は数えない） */
  noImage: { id: string; name: string }[]
  imageSize: string
  imageBytes: number
  files: string[]
}

const cellKey = (c: { sheet: string; col: number; row: number }) => `${c.sheet}:${c.col}:${c.row}`

/**
 * 元データからゲームのデータを書き出す（技術の書き出しと同じ流れ）。
 * - relics.webp: 使っているセルだけを一覧の順に横 5 個で並べ直し、1/4 の大きさにする（同じセルは 1 つにまとめる）
 * - relicData.json: 一覧の順。画像の位置（sprite・brokenSprite）は relics.webp 上のピクセル
 * - relicSprite.json: relics.webp とセルの大きさ
 * 技術の参照切れがあるとき・壊れた状態がそろっていないときは書き出さない
 */
export async function exportRelics(relics: readonly SourceRelic[], techIds: readonly string[]): Promise<ExportResult> {
  for (const r of relics) if (!isRelicId(r.id)) throw new ExportError(`遺物の ID は英小文字・数字・_ にしてください: ${r.id}`)
  const problems = relicProblems(relics, techIds)
  if (problems.length > 0) throw new ExportError(problems.join('\n'))

  const used = relics.flatMap(relicCells)
  const sheetFiles = [...new Set(used.map((c) => c.sheet))]
  const missing = sheetFiles.filter((f) => !existsSync(path.join(RELIC_SHEETS_DIR, f)))
  if (missing.length > 0) throw new ExportError(`元画像がありません（relics/sources/ に置いてください）: ${missing.join(', ')}`)

  const sheets = new Map<string, SheetInfo>()
  for (const f of sheetFiles) sheets.set(f, await readSheet(RELIC_SHEETS_DIR, f))
  for (const r of relics) {
    for (const cell of relicCells(r)) {
      const sheet = sheets.get(cell.sheet)!
      if (cell.col >= sheet.cols || cell.row >= sheet.rows) {
        throw new ExportError(`${r.id} ${r.name}: ${sheet.file} は ${sheet.cols}×${sheet.rows} なのに (${cell.col}, ${cell.row}) が指定されています`)
      }
    }
  }

  const cells = [...new Map(used.map((c) => [cellKey(c), c])).values()]
  const { image, width, height, positions } = await packCells(RELIC_SHEETS_DIR, sheets, cells,
    { cellWidth: OUT_CELL_W, cellHeight: OUT_CELL_H, cols: OUT_COLS, quality: 85 })
  const placed = new Map(cells.map((c, i) => [cellKey(c), positions[i]]))

  const relicData = relics.map(({ sprite, brokenSprite, ...r }) => ({
    ...r,
    ...(sprite ? { sprite: placed.get(cellKey(sprite))! } : {}),
    ...(brokenSprite ? { brokenSprite: placed.get(cellKey(brokenSprite))! } : {}),
  }))

  await writeAtomic(OUTPUT.relicImage, image)
  await writeAtomic(OUTPUT.relicData, JSON.stringify(relicData, null, 2) + '\n')
  await writeAtomic(OUTPUT.relicSprite, JSON.stringify({ width, height, cellWidth: OUT_CELL_W, cellHeight: OUT_CELL_H }, null, 2) + '\n')

  return {
    relicCount: relicData.length,
    noImage: relics.filter((r) => !r.sprite || (r.brokenName !== undefined && !r.brokenSprite)).map(({ id, name }) => ({ id, name })),
    imageSize: `${width}×${height}`,
    imageBytes: image.length,
    files: [OUTPUT.relicImage, OUTPUT.relicData, OUTPUT.relicSprite],
  }
}
