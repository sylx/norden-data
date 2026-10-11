import { useState, type ReactNode } from 'react'

/** 両方のエディタで使う入力欄 */

export function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`field ${wide ? 'field--wide' : ''}`}>
      <span className="field__label">{label}</span>
      {children}
    </label>
  )
}

/** スライダーと数値の入力 */
export function NumberField({ label, value, min = 0, max, step = 1, onChange }: {
  label: string
  value: number
  min?: number
  max: number
  step?: number
  onChange: (value: number) => void
}) {
  return (
    <div className="number-field">
      <span className="number-field__label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={Math.min(value, max)}
        onChange={(e) => onChange(Number(e.target.value))} />
      <input type="number" className="number-field__input" min={min} step={step} value={value}
        onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))} />
    </div>
  )
}

/** タグ。Enter か「、」「,」で追加、× で外す */
export function TagsField({ value, onChange }: { value: readonly string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState('')
  const add = (text: string) => {
    const added = [...new Set(text.split(/[,、\s]+/).map((t) => t.trim()))].filter((t) => t && !value.includes(t))
    if (added.length) onChange([...value, ...added])
  }
  const commit = () => {
    add(draft)
    setDraft('')
  }
  // 区切りを打ったら、そこまでをタグにする
  const onInput = (text: string, composing: boolean) => {
    const parts = composing ? [text] : text.split(/[,、]/)
    if (parts.length > 1) add(parts.slice(0, -1).join(','))
    setDraft(parts[parts.length - 1])
  }
  return (
    <div className="tags">
      {value.map((tag) => (
        <span key={tag} className="tags__item">
          {tag}
          <button type="button" className="tags__remove" aria-label={`${tag}を外す`}
            onClick={() => onChange(value.filter((t) => t !== tag))}>×</button>
        </span>
      ))}
      <input className="tags__input" value={draft} placeholder="タグを追加"
        onChange={(e) => onInput(e.target.value, (e.nativeEvent as InputEvent).isComposing)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); commit() }
          if (e.key === 'Backspace' && draft === '' && value.length) onChange(value.slice(0, -1))
        }}
        onCompositionEnd={(e) => onInput(e.currentTarget.value, false)}
        onBlur={commit} />
    </div>
  )
}

/** 保存の状態（未保存・保存しました・エラー） */
export function SaveStatus({ dirty, message, error }: { dirty: boolean; message?: string; error?: string }) {
  if (error) return <span className="save-status save-status--error">{error}</span>
  if (dirty) return <span className="save-status save-status--dirty">未保存の変更があります</span>
  if (message) return <span className="save-status">{message}</span>
  return null
}
