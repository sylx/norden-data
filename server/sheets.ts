import { readdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import type { SheetInfo } from '../src/characters/types.ts'
import { SHEETS_DIR } from './paths.ts'

/** 元画像は横 5 人、セルの間に 50px の余白。行数（以前は 3、最近は 2）は画像の大きさから決める */
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

export async function readSheet(file: string): Promise<SheetInfo> {
  const { width, height } = await sharp(path.join(SHEETS_DIR, file)).metadata()
  if (!width || !height) throw new Error(`画像の大きさが読めません: ${file}`)
  return detectLayout(file, width, height)
}

export async function listSheets(): Promise<SheetInfo[]> {
  let files: string[]
  try {
    files = (await readdir(SHEETS_DIR)).filter(isSheetFileName).sort()
  } catch {
    return []
  }
  return Promise.all(files.map(readSheet))
}
