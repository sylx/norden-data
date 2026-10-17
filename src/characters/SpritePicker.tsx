import { useState } from 'react'
import { SheetCrop, type SheetBase } from './SheetCrop'
import { cellRect, type SheetInfo } from './types'

const THUMB_W = 64

/** 元画像のセルを画像に持つもの（騎士・施設） */
interface SpriteOwner {
  id: string
  name: string
  sprite: { sheet: string; col: number; row: number } | null
}

/**
 * 元画像を選び、セルをクリックして item の画像にする。ほかの items が使っているセルには ID を出す。
 * base と dir は元画像の URL とフォルダ（騎士は /sheets と characters/sheets/）
 */
export function SpritePicker<T extends SpriteOwner>({ sheets, item, items, base, dir, onPick }: {
  sheets: readonly SheetInfo[]
  item: T
  items: readonly T[]
  base?: SheetBase
  dir: string
  onPick: (sprite: T['sprite']) => void
}) {
  const [chosen, setChosen] = useState<{ id: string; file: string } | null>(null)
  // 切り替えたら、その画像の元画像を開く
  const viewFile = (chosen?.id === item.id ? chosen.file : undefined) ?? item.sprite?.sheet ?? sheets[0]?.file ?? ''
  const sheet = sheets.find((s) => s.file === viewFile)

  const usedBy = new Map<string, T>()
  for (const c of items) if (c.sprite?.sheet === viewFile) usedBy.set(`${c.sprite.col},${c.sprite.row}`, c)

  return (
    <div className="sprite-picker">
      <div className="toolbar">
        <select className="toolbar__select" value={viewFile} onChange={(e) => setChosen({ id: item.id, file: e.target.value })}>
          {sheets.length === 0 && <option value="">元画像がありません</option>}
          {item.sprite && !sheets.some((s) => s.file === item.sprite!.sheet) && (
            <option value={item.sprite.sheet}>{item.sprite.sheet}（見つかりません）</option>
          )}
          {sheets.map((s) => <option key={s.file} value={s.file}>{s.file}（{s.cols}×{s.rows}）</option>)}
        </select>
        {item.sprite && <button type="button" className="button" onClick={() => onPick(null)}>画像を外す</button>}
      </div>
      {!sheet && viewFile && (
        <p className="notice notice--warn">{viewFile} が {dir} にありません。元画像を置いて「画像を読み直す」を押してください</p>
      )}
      {sheets.length === 0 && <p className="form__hint">元画像を {dir} に置いて「画像を読み直す」を押してください</p>}
      {sheet && (
        <>
          <p className="sprite-picker__info">{sheet.width}×{sheet.height}・セル {sheet.cellWidth}×{sheet.cellHeight}・余白 {sheet.padding}</p>
          <div className="sprite-picker__grid" style={{ gridTemplateColumns: `repeat(${sheet.cols}, ${THUMB_W}px)` }}>
            {Array.from({ length: sheet.rows * sheet.cols }, (_, i) => {
              const col = i % sheet.cols
              const row = Math.floor(i / sheet.cols)
              const owner = usedBy.get(`${col},${row}`)
              const selected = owner?.id === item.id
              return (
                <button key={i} type="button" title={owner ? `${owner.id} ${owner.name}` : '未使用'}
                  className={`sprite-picker__cell ${selected ? 'is-selected' : ''} ${owner && !selected ? 'is-used' : ''}`}
                  onClick={() => onPick({ sheet: sheet.file, col, row })}>
                  <SheetCrop sheet={sheet} rect={cellRect(sheet, col, row)} width={THUMB_W} base={base} />
                  {owner && <span className="sprite-picker__owner">{owner.id}</span>}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
