import { readdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { cellOrigin, type SheetInfo } from '../src/characters/types.ts'

/**
 * 元画像（騎士は characters/sheets/、施設は buildings/sources/）は横 5 セル、セルの間に 50px の余白。
 * 行数（騎士は 3 か 2、施設は 4）は画像の大きさから決める
 */
const SHEET_COLS = 5
const SHEET_PADDING = 50
const MAX_ROWS = 6
/** セルの縦横比（1024×1536） */
const CELL_ASPECT = 1.5

export const isSheetFileName = (name: string) => /^[\w.-]+\.(png|webp|jpe?g)$/i.test(name) && !name.startsWith('.')

/** 縦横比がセルの 2:3 に一番近くなる行数を選ぶ */
export function detectLayout(file: string, width: number, height: number): SheetInfo {
  const cellWidth = (width - SHEET_PADDING * (SHEET_COLS - 1)) / SHEET_COLS
  let best: SheetInfo | null = null
  let bestError = Infinity
  for (let rows = 1; rows <= MAX_ROWS; rows++) {
    const cellHeight = (height - SHEET_PADDING * (rows - 1)) / rows
    const error = Math.abs(cellHeight / cellWidth - CELL_ASPECT)
    if (error < bestError) {
      bestError = error
      best = { file, width, height, cols: SHEET_COLS, rows, cellWidth, cellHeight, padding: SHEET_PADDING }
    }
  }
  return best!
}

export async function readSheet(dir: string, file: string): Promise<SheetInfo> {
  const { width, height } = await sharp(path.join(dir, file)).metadata()
  if (!width || !height) throw new Error(`画像の大きさが読めません: ${file}`)
  return detectLayout(file, width, height)
}

export async function listSheets(dir: string): Promise<SheetInfo[]> {
  let files: string[]
  try {
    files = (await readdir(dir)).filter(isSheetFileName).sort()
  } catch {
    return []
  }
  return Promise.all(files.map((file) => readSheet(dir, file)))
}

/**
 * 使うセルを切り出して縮め、横 cols 個ずつ詰めて並べ直した 1 枚にする。
 * 元画像は 1 枚ずつ読む。返す位置は cells と同じ順の、書き出す画像の上のピクセル
 */
export async function packCells(dir: string, sheets: ReadonlyMap<string, SheetInfo>, cells: readonly { sheet: string; col: number; row: number }[],
  out: { cellWidth: number; cellHeight: number; cols: number; quality: number }): Promise<{ image: Buffer; width: number; height: number; positions: { x: number; y: number }[] }> {
  const positions = cells.map((_, i) => ({ x: (i % out.cols) * out.cellWidth, y: Math.floor(i / out.cols) * out.cellHeight }))
  const layers: { input: Buffer; left: number; top: number }[] = []
  for (const file of new Set(cells.map((c) => c.sheet))) {
    const sheet = sheets.get(file)!
    const raw = await sharp(path.join(dir, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    for (const [i, cell] of cells.entries()) {
      if (cell.sheet !== file) continue
      const origin = cellOrigin(sheet, cell.col, cell.row)
      const input = await sharp(raw.data, { raw: { width: raw.info.width, height: raw.info.height, channels: 4 } })
        .extract({ left: Math.round(origin.x), top: Math.round(origin.y), width: Math.round(sheet.cellWidth), height: Math.round(sheet.cellHeight) })
        .resize(out.cellWidth, out.cellHeight, { fit: 'fill' })
        .png()
        .toBuffer()
      layers.push({ input, left: positions[i].x, top: positions[i].y })
    }
  }
  const width = out.cellWidth * out.cols
  // セルが無くても 1 行分の空の画像にする（ゲームが常に読めるように）
  const height = out.cellHeight * Math.max(1, Math.ceil(cells.length / out.cols))
  const image = await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(layers)
    .webp({ quality: out.quality, effort: 6 })
    .toBuffer()
  return { image, width, height, positions }
}
