import { useEffect, useRef } from 'react'
import { NumberField } from '../fields'
import type { BuildingSource, SquareCrop } from './types'

const VIEW_W = 360
const MIN_SIZE = 32
const WHEEL_STEP = 24

export const sourceUrl = (file: string) => `/building-sources/${encodeURIComponent(file)}`

/** 元画像の正方形の範囲を幅 width で表示する */
export function CropPreview({ source, crop, width, className = '' }: {
  source: BuildingSource
  crop: SquareCrop
  width: number
  className?: string
}) {
  const scale = width / crop.size
  return (
    <div className={`sheet-crop ${className}`} style={{
      width,
      height: width,
      backgroundImage: `url(${sourceUrl(source.file)})`,
      backgroundSize: `${source.width * scale}px ${source.height * scale}px`,
      backgroundPosition: `${-crop.x * scale}px ${-crop.y * scale}px`,
    }} />
  )
}

/**
 * 元画像から切り抜く正方形の範囲。範囲をドラッグで動かし、外をクリックするとそこを中心にする。
 * ホイールで大きさを変える（キャラクターの顔の範囲と同じ操作）
 */
export function SquareCropEditor({ source, crop, onChange }: {
  source: BuildingSource
  crop: SquareCrop
  onChange: (crop: SquareCrop) => void
}) {
  const viewRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ dx: number; dy: number } | null>(null)
  const scale = VIEW_W / source.width
  const maxSize = Math.min(source.width, source.height)

  const clamp = (c: SquareCrop): SquareCrop => {
    const size = Math.round(Math.max(MIN_SIZE, Math.min(maxSize, c.size)))
    return {
      x: Math.round(Math.max(0, Math.min(source.width - size, c.x))),
      y: Math.round(Math.max(0, Math.min(source.height - size, c.y))),
      size,
    }
  }

  /** 画面上の位置 → 元画像のピクセル */
  const toSource = (clientX: number, clientY: number) => {
    const box = viewRef.current!.getBoundingClientRect()
    return { x: (clientX - box.left) / scale, y: (clientY - box.top) / scale }
  }

  const resize = (c: SquareCrop, size: number) =>
    clamp({ x: c.x + c.size / 2 - size / 2, y: c.y + c.size / 2 - size / 2, size })

  // ホイールで画面がスクロールしないように passive でない listener にする
  const latest = useRef({ crop, onChange, resize })
  useEffect(() => { latest.current = { crop, onChange, resize } })
  useEffect(() => {
    const el = viewRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const { crop: c, onChange: change, resize: fit } = latest.current
      change(fit(c, c.size + (e.deltaY < 0 ? WHEEL_STEP : -WHEEL_STEP)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  return (
    <div className="face-editor">
      <div ref={viewRef} className="face-editor__view" style={{
        width: VIEW_W,
        height: source.height * scale,
        backgroundImage: `url(${sourceUrl(source.file)})`,
        backgroundSize: '100% 100%',
      }}
        onPointerDown={(e) => {
          const p = toSource(e.clientX, e.clientY)
          const inside = p.x >= crop.x && p.x <= crop.x + crop.size && p.y >= crop.y && p.y <= crop.y + crop.size
          drag.current = inside ? { dx: p.x - crop.x, dy: p.y - crop.y } : { dx: crop.size / 2, dy: crop.size / 2 }
          if (!inside) onChange(clamp({ ...crop, x: p.x - crop.size / 2, y: p.y - crop.size / 2 }))
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          const p = toSource(e.clientX, e.clientY)
          onChange(clamp({ ...crop, x: p.x - drag.current.dx, y: p.y - drag.current.dy }))
        }}
        onPointerUp={() => { drag.current = null }}
        onPointerCancel={() => { drag.current = null }}>
        <div className="face-editor__rect" style={{
          left: crop.x * scale,
          top: crop.y * scale,
          width: crop.size * scale,
          height: crop.size * scale,
        }} />
      </div>
      <NumberField label="X" value={crop.x} max={source.width - crop.size} onChange={(x) => onChange(clamp({ ...crop, x }))} />
      <NumberField label="Y" value={crop.y} max={source.height - crop.size} onChange={(y) => onChange(clamp({ ...crop, y }))} />
      <NumberField label="大きさ" value={crop.size} min={MIN_SIZE} max={maxSize} onChange={(size) => onChange(resize(crop, size))} />
    </div>
  )
}
