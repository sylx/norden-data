import { useEffect, useRef } from 'react'
import { NumberField } from '../fields'
import { SheetCrop } from './SheetCrop'
import { cellRect, type Rect, type SheetInfo } from './types'

const VIEW_W = 240
const MIN_SIZE = 64
const WHEEL_STEP = 16

/**
 * 顔の範囲（正方形）の設定。範囲をドラッグで動かし、外をクリックするとそこを中心にする。
 * ホイールで大きさを変える
 */
export function FaceRectEditor({ sheet, col, row, faceRect, onChange }: {
  sheet: SheetInfo
  col: number
  row: number
  faceRect: Rect
  onChange: (rect: Rect) => void
}) {
  const viewRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ dx: number; dy: number } | null>(null)
  const scale = VIEW_W / sheet.cellWidth
  const maxSize = Math.min(sheet.cellWidth, sheet.cellHeight)
  const cell = cellRect(sheet, col, row)
  const faceOnSheet = { ...faceRect, x: cell.x + faceRect.x, y: cell.y + faceRect.y }

  const clamp = (r: Rect): Rect => {
    const size = Math.max(MIN_SIZE, Math.min(maxSize, r.width))
    return {
      x: Math.max(0, Math.min(sheet.cellWidth - size, r.x)),
      y: Math.max(0, Math.min(sheet.cellHeight - size, r.y)),
      width: size,
      height: size,
    }
  }

  /** 画面上の位置 → セルのピクセル */
  const toCell = (clientX: number, clientY: number) => {
    const box = viewRef.current!.getBoundingClientRect()
    return { x: (clientX - box.left) / scale, y: (clientY - box.top) / scale }
  }

  // ホイールで画面がスクロールしないように passive でない listener にする
  const latest = useRef({ faceRect, onChange, clamp })
  useEffect(() => { latest.current = { faceRect, onChange, clamp } })
  useEffect(() => {
    const el = viewRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const { faceRect: r, onChange: change, clamp: fit } = latest.current
      const size = r.width + (e.deltaY < 0 ? WHEEL_STEP : -WHEEL_STEP)
      const cx = r.x + r.width / 2
      const cy = r.y + r.height / 2
      change(fit({ x: cx - size / 2, y: cy - size / 2, width: size, height: size }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const setSize = (size: number) => {
    const cx = faceRect.x + faceRect.width / 2
    const cy = faceRect.y + faceRect.height / 2
    onChange(clamp({ x: cx - size / 2, y: cy - size / 2, width: size, height: size }))
  }

  return (
    <div className="face-editor">
      <div className="face-editor__row">
        <div ref={viewRef} className="face-editor__view" style={{ width: VIEW_W, height: sheet.cellHeight * scale }}
          onPointerDown={(e) => {
            const p = toCell(e.clientX, e.clientY)
            const inside = p.x >= faceRect.x && p.x <= faceRect.x + faceRect.width && p.y >= faceRect.y && p.y <= faceRect.y + faceRect.height
            drag.current = inside ? { dx: p.x - faceRect.x, dy: p.y - faceRect.y } : { dx: faceRect.width / 2, dy: faceRect.height / 2 }
            if (!inside) onChange(clamp({ ...faceRect, x: p.x - faceRect.width / 2, y: p.y - faceRect.height / 2 }))
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            if (!drag.current) return
            const p = toCell(e.clientX, e.clientY)
            onChange(clamp({ ...faceRect, x: p.x - drag.current.dx, y: p.y - drag.current.dy }))
          }}
          onPointerUp={() => { drag.current = null }}
          onPointerCancel={() => { drag.current = null }}>
          <SheetCrop sheet={sheet} rect={cell} width={VIEW_W} />
          <div className="face-editor__rect" style={{
            left: faceRect.x * scale,
            top: faceRect.y * scale,
            width: faceRect.width * scale,
            height: faceRect.height * scale,
          }} />
        </div>
        <div className="face-editor__previews">
          <span className="face-editor__caption">顔</span>
          <SheetCrop sheet={sheet} rect={faceOnSheet} width={96} className="face-editor__face" />
          <SheetCrop sheet={sheet} rect={faceOnSheet} width={48} className="face-editor__face face-editor__face--small" />
        </div>
      </div>
      <NumberField label="X" value={Math.round(faceRect.x)} max={sheet.cellWidth - faceRect.width}
        onChange={(x) => onChange(clamp({ ...faceRect, x }))} />
      <NumberField label="Y" value={Math.round(faceRect.y)} max={sheet.cellHeight - faceRect.height}
        onChange={(y) => onChange(clamp({ ...faceRect, y }))} />
      <NumberField label="大きさ" value={Math.round(faceRect.width)} min={MIN_SIZE} max={maxSize} onChange={setSize} />
    </div>
  )
}
