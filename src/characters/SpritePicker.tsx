import { useState } from 'react'
import { SheetCrop } from './SheetCrop'
import { cellRect, type SheetInfo, type SourceCharacter } from './types'

const THUMB_W = 64

/** 元画像を選び、セルをクリックしてキャラクターの画像にする。ほかのキャラクターが使っているセルには ID を出す */
export function SpritePicker({ sheets, character, characters, onPick }: {
  sheets: readonly SheetInfo[]
  character: SourceCharacter
  characters: readonly SourceCharacter[]
  onPick: (sprite: SourceCharacter['sprite']) => void
}) {
  const [chosen, setChosen] = useState<{ id: string; file: string } | null>(null)
  // キャラクターを切り替えたら、そのキャラクターの元画像を開く
  const viewFile = (chosen?.id === character.id ? chosen.file : undefined) ?? character.sprite?.sheet ?? sheets[0]?.file ?? ''
  const sheet = sheets.find((s) => s.file === viewFile)

  const usedBy = new Map<string, SourceCharacter>()
  for (const c of characters) if (c.sprite?.sheet === viewFile) usedBy.set(`${c.sprite.col},${c.sprite.row}`, c)

  return (
    <div className="sprite-picker">
      <div className="toolbar">
        <select className="toolbar__select" value={viewFile} onChange={(e) => setChosen({ id: character.id, file: e.target.value })}>
          {sheets.length === 0 && <option value="">元画像がありません</option>}
          {character.sprite && !sheets.some((s) => s.file === character.sprite!.sheet) && (
            <option value={character.sprite.sheet}>{character.sprite.sheet}（見つかりません）</option>
          )}
          {sheets.map((s) => <option key={s.file} value={s.file}>{s.file}（{s.cols}×{s.rows}）</option>)}
        </select>
        {character.sprite && <button type="button" className="button" onClick={() => onPick(null)}>画像を外す</button>}
      </div>
      {!sheet && viewFile && (
        <p className="notice notice--warn">{viewFile} が characters/sheets/ にありません。元画像を置いて「画像を読み直す」を押してください</p>
      )}
      {sheet && (
        <>
          <p className="sprite-picker__info">{sheet.width}×{sheet.height}・セル {sheet.cellWidth}×{sheet.cellHeight}・余白 {sheet.padding}</p>
          <div className="sprite-picker__grid" style={{ gridTemplateColumns: `repeat(${sheet.cols}, ${THUMB_W}px)` }}>
            {Array.from({ length: sheet.rows * sheet.cols }, (_, i) => {
              const col = i % sheet.cols
              const row = Math.floor(i / sheet.cols)
              const owner = usedBy.get(`${col},${row}`)
              const selected = owner?.id === character.id
              return (
                <button key={i} type="button" title={owner ? `${owner.id} ${owner.name}` : '未使用'}
                  className={`sprite-picker__cell ${selected ? 'is-selected' : ''} ${owner && !selected ? 'is-used' : ''}`}
                  onClick={() => onPick({ sheet: sheet.file, col, row })}>
                  <SheetCrop sheet={sheet} rect={cellRect(sheet, col, row)} width={THUMB_W} />
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
