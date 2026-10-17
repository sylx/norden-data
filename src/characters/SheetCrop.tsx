import type { CSSProperties } from 'react'
import { cellRect, type Rect, type SheetInfo, type SourceCharacter } from './types'

/** 元画像の URL の置き場所。騎士は /sheets（characters/sheets/）、施設は /building-sheets（buildings/sources/） */
export type SheetBase = '/sheets' | '/building-sheets'

/** 元画像の一部（rect、元画像のピクセル）を幅 width で表示する */
export function SheetCrop({ sheet, rect, width, base = '/sheets', className = '', style }: {
  sheet: SheetInfo
  rect: Rect
  width: number
  base?: SheetBase
  className?: string
  style?: CSSProperties
}) {
  const scale = width / rect.width
  return (
    <div className={`sheet-crop ${className}`} style={{
      width,
      height: rect.height * scale,
      backgroundImage: `url(${base}/${encodeURIComponent(sheet.file)})`,
      backgroundSize: `${sheet.width * scale}px ${sheet.height * scale}px`,
      backgroundPosition: `${-rect.x * scale}px ${-rect.y * scale}px`,
      ...style,
    }} />
  )
}

/** キャラクターの顔か全身。画像が無ければ空の枠 */
export function CharacterThumb({ character, sheets, mode, width, className = '' }: {
  character: SourceCharacter
  sheets: ReadonlyMap<string, SheetInfo>
  mode: 'face' | 'full'
  width: number
  className?: string
}) {
  const sheet = character.sprite && sheets.get(character.sprite.sheet)
  if (!sheet || !character.sprite) {
    const height = mode === 'face' ? width : width * 1.5
    return <div className={`sheet-crop sheet-crop--empty ${className}`} style={{ width, height }}>?</div>
  }
  const cell = cellRect(sheet, character.sprite.col, character.sprite.row)
  const rect = mode === 'face'
    ? { ...character.faceRect, x: cell.x + character.faceRect.x, y: cell.y + character.faceRect.y }
    : cell
  return <SheetCrop sheet={sheet} rect={rect} width={width} className={className} />
}
