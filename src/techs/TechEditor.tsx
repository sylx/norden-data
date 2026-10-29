import { useCallback, useEffect, useMemo, useState } from 'react'
import { BUILDING_EFFECT_LABELS, describeEffect } from '@game/data/buildings.ts'
import { TECH_BRANCH_LABELS, type TechBranch, type TechEffect } from '@game/data/techs.ts'
import { api, errorMessage } from '../api'
import { Field, NumberField, SaveStatus } from '../fields'
import { useLeaveGuard } from '../useDirty'
import { SheetCrop } from '../characters/SheetCrop'
import { SpritePicker } from '../characters/SpritePicker'
import { cellRect, type SheetInfo } from '../characters/types'
import { createTech, isTechId, requiresCycle, techDepths, techProblems, type SourceTech } from './types'

type TechEffectKind = TechEffect['kind']

/** 技術の効果に使える種類（施設の効果のうち、都市の数値にかかるものと、その他） */
const EFFECT_KINDS: readonly TechEffectKind[] = ['marketPct', 'productionPct', 'growthPct', 'trainingPct', 'recruitPct', 'recruitMorale', 'etc']

const BRANCHES = Object.keys(TECH_BRANCH_LABELS) as TechBranch[]

/** 種類を kind に変えた効果。前の値は引き継げるときだけ引き継ぐ（その他はテキスト、ほかは数） */
function withKind(effect: TechEffect, kind: TechEffectKind): TechEffect {
  if (kind === 'etc') return { kind, value: effect.kind === 'etc' ? effect.value : '' }
  return { kind, value: effect.kind === 'etc' ? 5 : effect.value }
}

/** server/exportTechs.ts の ExportResult */
interface ExportResult {
  techCount: number
  noImage: { id: string; name: string }[]
  imageSize: string
  imageBytes: number
  files: string[]
}

/** 技術の画像。square は幅に合わせて上下を切った正方形（一覧の小さい画像） */
function TechThumb({ tech, sheets, width, square, className = '' }: {
  tech: SourceTech
  sheets: ReadonlyMap<string, SheetInfo>
  width: number
  square?: boolean
  className?: string
}) {
  const sheet = tech.sprite && sheets.get(tech.sprite.sheet)
  if (!sheet || !tech.sprite) {
    return <div className={`sheet-crop sheet-crop--empty ${className}`} style={{ width, height: square ? width : width * 1.5 }}>?</div>
  }
  const cell = cellRect(sheet, tech.sprite.col, tech.sprite.row)
  const rect = square ? { ...cell, y: cell.y + (cell.height - cell.width) / 2, height: cell.width } : cell
  return <SheetCrop sheet={sheet} rect={rect} width={width} base="/tech-sheets" className={className} />
}

/** 系統ごとに、段（前提からの深さ）を列にした簡単なツリー。前提のつながりの確認用 */
function TechTree({ techs, selectedId, onSelect }: { techs: readonly SourceTech[]; selectedId: string; onSelect: (id: string) => void }) {
  const depths = techDepths(techs)
  const nameOf = (id: string) => techs.find((t) => t.id === id)?.name ?? id
  const selected = techs.find((t) => t.id === selectedId)
  return (
    <div className="tech-tree">
      {BRANCHES.map((branch) => {
        const inBranch = techs.filter((t) => t.branch === branch)
        const columns = Math.max(0, ...inBranch.map((t) => (depths.get(t.id) ?? 0) + 1))
        return (
          <section key={branch} className="tech-tree__branch">
            <h3 className="form__heading">{TECH_BRANCH_LABELS[branch]}</h3>
            <div className="tech-tree__columns">
              {Array.from({ length: columns }, (_, depth) => (
                <ol key={depth} className="tech-tree__column">
                  {inBranch.filter((t) => (depths.get(t.id) ?? 0) === depth).map((t) => {
                    const related = selected && (selected.requires.includes(t.id) ? 'is-required' : t.requires.includes(selected.id) ? 'is-child' : '')
                    return (
                      <li key={t.id}>
                        <button type="button" className={`tech-tree__node ${t.id === selectedId ? 'is-selected' : ''} ${related || ''}`}
                          title={t.requires.length > 0 ? `前提: ${t.requires.map(nameOf).join('・')}` : '根'}
                          onClick={() => onSelect(t.id)}>
                          {t.name}<span className="tech-tree__cost">{t.cost}</span>
                        </button>
                      </li>
                    )
                  })}
                </ol>
              ))}
            </div>
          </section>
        )
      })}
      <p className="form__hint">選んだ技術の前提は青、それを前提にする技術は緑。前提が循環している技術は出ない</p>
    </div>
  )
}

/**
 * 技術データの元データ（techs/techs.json）を編集し、ゲームのデータに書き出す。左に一覧、右に画像と入力、下にツリー。
 * 画像は techs/sources/ の元画像（施設と同じ横 5 × 縦 4）のセルを選び、書き出しで techs.webp に並べ直す
 */
export function TechEditor() {
  const [techs, setTechs] = useState<SourceTech[] | null>(null)
  const [sheets, setSheets] = useState<SheetInfo[]>([])
  const [savedJson, setSavedJson] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [newId, setNewId] = useState('')
  const [status, setStatus] = useState<{ message?: string; error?: string }>({})
  const [exported, setExported] = useState<ExportResult | null>(null)
  const [busy, setBusy] = useState(false)

  const loadSheets = useCallback(() => api<SheetInfo[]>('/api/tech-sheets').then(
    setSheets,
    (e) => setStatus({ error: errorMessage(e) }),
  ), [])

  const load = useCallback(() => api<SourceTech[]>('/api/techs').then(
    (list) => {
      setTechs(list)
      setSavedJson(JSON.stringify(list))
      setSelectedId((id) => (list.some((t) => t.id === id) ? id : list[0]?.id ?? ''))
      setStatus({})
    },
    (e) => setStatus({ error: errorMessage(e) }),
  ), [])
  useEffect(() => { load(); loadSheets() }, [load, loadSheets])

  const dirty = techs !== null && JSON.stringify(techs) !== savedJson
  useLeaveGuard(dirty)

  const sheetMap = useMemo(() => new Map(sheets.map((s) => [s.file, s])), [sheets])
  const nameOf = (id: string) => techs?.find((t) => t.id === id)?.name ?? id

  const save = async (list = techs) => {
    if (!list) return false
    try {
      await api('/api/techs', { method: 'PUT', body: list })
      setSavedJson(JSON.stringify(list))
      setStatus({ message: `保存しました（${new Date().toLocaleTimeString()}）` })
      return true
    } catch (e) {
      setStatus({ error: errorMessage(e) })
      return false
    }
  }

  const exportToGame = async () => {
    setBusy(true)
    setExported(null)
    try {
      if (dirty && !(await save())) return
      setStatus({ message: '書き出し中…' })
      const result = await api<ExportResult>('/api/techs/export', { method: 'POST' })
      setExported(result)
      setStatus({ message: `書き出しました（${new Date().toLocaleTimeString()}）` })
    } catch (e) {
      setStatus({ error: errorMessage(e) })
    } finally {
      setBusy(false)
    }
  }

  const tech = techs?.find((t) => t.id === selectedId)
  const update = (patch: Partial<SourceTech>) => setTechs((list) => list && list.map((t) => (t.id === selectedId ? { ...t, ...patch } : t)))
  const setEffects = (effects: TechEffect[]) => update({ effects })

  const idProblem = (() => {
    if (!newId) return null
    if (!isTechId(newId)) return 'ID は英小文字で始め、英小文字・数字・_ にしてください'
    if (techs?.some((t) => t.id === newId)) return 'その ID はもうあります'
    return null
  })()

  /** 選んでいる技術の子として足す（系統と前提を引き継ぐ） */
  const add = () => {
    if (!newId || idProblem) return
    setTechs((list) => list && [...list, { ...createTech(newId, tech?.branch), requires: tech ? [tech.id] : [] }])
    setSelectedId(newId)
    setNewId('')
  }

  /** 削除した技術を前提にしていた技術からは、前提を外す */
  const remove = () => {
    if (!techs || !tech) return
    const children = techs.filter((t) => t.requires.includes(tech.id))
    const note = children.length ? `\n${children.map((t) => t.name).join('・')}の前提からも外します。` : ''
    if (!confirm(`${tech.name}（${tech.id}）を削除しますか？${note}\n施設の必要な技術に入っていれば、そこには残ります`)) return
    const rest = techs.filter((t) => t.id !== tech.id).map((t) => ({ ...t, requires: t.requires.filter((id) => id !== tech.id) }))
    setTechs(rest)
    setSelectedId(rest[0]?.id ?? '')
  }

  if (!techs) return <div className="loading">{status.error ?? '読み込み中…'}</div>

  const problems = techProblems(techs)
  /** 前提に選ぶと循環する技術 */
  const wouldCycle = (id: string) => Boolean(tech
    && requiresCycle(techs.map((t) => (t.id === tech.id ? { ...t, requires: [...t.requires, id] } : t)), tech.id))
  const children = tech ? techs.filter((t) => t.requires.includes(tech.id)) : []

  return (
    <div className="character-editor">
      <aside className="character-list panel">
        <div className="toolbar">
          <input className="toolbar__search" value={newId} placeholder="新しい技術の ID（例: rifle）"
            onChange={(e) => setNewId(e.target.value.trim())} onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
          <button type="button" className="button" disabled={!newId || !!idProblem} onClick={add}
            title="選んでいる技術の子として足す">追加</button>
        </div>
        {idProblem && <span className="save-status save-status--error">{idProblem}</span>}
        <ul className="character-list__items">
          {techs.map((t) => (
            <li key={t.id}>
              <button type="button" className={`character-list__item ${t.id === selectedId ? 'is-selected' : ''}`}
                onClick={() => setSelectedId(t.id)}>
                <TechThumb tech={t} sheets={sheetMap} width={40} square className="building-list__image" />
                <span className="character-list__text">
                  <span className="character-list__name">{t.name}</span>
                  <span className="character-list__sub">
                    {[
                      t.id,
                      TECH_BRANCH_LABELS[t.branch],
                      `${t.cost}pt`,
                      t.requires.length > 0 ? `前提 ${t.requires.map(nameOf).join('・')}` : '根',
                      t.effects.map(describeEffect).join('・') || '効果なし',
                    ].join(' / ')}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="character-main">
        <div className="toolbar panel">
          <button type="button" className="button button--primary" disabled={!dirty || busy} onClick={() => save()}>保存</button>
          <button type="button" className="button" disabled={!dirty || busy}
            onClick={() => { if (confirm('保存していない変更を捨てて読み込み直しますか？')) load() }}>元に戻す</button>
          <button type="button" className="button button--accent" disabled={busy || problems.length > 0} onClick={exportToGame}
            title="保存してから、ゲームの techData.json・techSprite.json・techs.webp に書き出す">ゲームに書き出す</button>
          <button type="button" className="button" onClick={loadSheets}>画像を読み直す</button>
          <SaveStatus dirty={dirty} {...status} />
        </div>

        {problems.length > 0 && <div className="notice notice--warn">{problems.map((p) => <div key={p}>{p}</div>)}</div>}
        {exported && (
          <div className="notice notice--ok">
            {exported.techCount}件を書き出しました（{exported.imageSize}、{(exported.imageBytes / 1024).toFixed(0)} KB）
            {exported.noImage.length > 0 && <div>画像が未設定: {exported.noImage.map((t) => `${t.id} ${t.name}`).join('、')}</div>}
            <ul className="notice__files">{exported.files.map((f) => <li key={f}>{f}</li>)}</ul>
          </div>
        )}

        {tech && (
          <div className="character-form">
            <div className="character-form__images panel">
              <h3 className="form__heading">画像</h3>
              <SpritePicker sheets={sheets} item={tech} items={techs} base="/tech-sheets" dir="techs/sources/"
                onPick={(sprite) => update({ sprite })} />
              {tech.sprite && <TechThumb tech={tech} sheets={sheetMap} width={128} className="building-preview" />}
            </div>

            <div className="character-form__data panel form">
              <h2 className="form__title">
                {tech.name}<span className="form__id">{tech.id}</span>
                <button type="button" className="button button--danger form__delete" onClick={remove}>削除</button>
              </h2>

              <div className="form__grid">
                <Field label="名前"><input value={tech.name} onChange={(e) => update({ name: e.target.value })} /></Field>
                <Field label="系統">
                  <select value={tech.branch} onChange={(e) => update({ branch: e.target.value as TechBranch })}>
                    {BRANCHES.map((b) => <option key={b} value={b}>{TECH_BRANCH_LABELS[b]}</option>)}
                  </select>
                </Field>
                <Field label="説明（フレーバーテキスト）" wide>
                  <textarea rows={3} value={tech.description} onChange={(e) => update({ description: e.target.value })} />
                </Field>
              </div>
              <NumberField label="必要な研究ポイント" value={tech.cost} min={1} max={10000} step={10} onChange={(cost) => update({ cost })} />

              <h3 className="form__heading">前提の技術（全部要る）</h3>
              <div className="tech-requires">
                {techs.filter((t) => t.id !== tech.id).map((t) => {
                  const checked = tech.requires.includes(t.id)
                  const cycle = !checked && wouldCycle(t.id)
                  return (
                    <label key={t.id} className={`tech-requires__item ${cycle ? 'is-disabled' : ''}`} title={cycle ? '選ぶと前提が循環します' : undefined}>
                      <input type="checkbox" checked={checked} disabled={cycle}
                        onChange={(e) => update({ requires: e.target.checked ? [...tech.requires, t.id] : tech.requires.filter((id) => id !== t.id) })} />
                      {t.name}
                    </label>
                  )
                })}
              </div>
              <p className="form__hint">
                {tech.requires.length === 0 ? '根（最初から研究できる）' : `前提: ${tech.requires.map(nameOf).join('・')}`}
                {children.length > 0 && ` / この技術を前提にする: ${children.map((t) => t.name).join('・')}`}
              </p>

              <h3 className="form__heading">効果（研究し終えた勢力の全都市）</h3>
              {tech.effects.map((effect, i) => (
                <div key={i} className="relation">
                  <select value={effect.kind} onChange={(e) => setEffects(tech.effects.map((ef, j) => (
                    j === i ? withKind(ef, e.target.value as TechEffectKind) : ef)))}>
                    {EFFECT_KINDS.map((k) => <option key={k} value={k}>{BUILDING_EFFECT_LABELS[k]}</option>)}
                  </select>
                  {effect.kind === 'etc' ? (
                    <input className="relation__target" value={effect.value} placeholder="ゲームではまだ表せない効果（例: 一斉攻撃が解禁）"
                      onChange={(e) => setEffects(tech.effects.map((ef, j) => (j === i ? { ...effect, value: e.target.value } : ef)))} />
                  ) : (
                    <>
                      <input type="number" className="number-field__input building-effect__value" value={effect.value} step={5}
                        onChange={(e) => setEffects(tech.effects.map((ef, j) => (
                          j === i ? { ...effect, value: e.target.value === '' ? 0 : Number(e.target.value) } : ef)))} />
                      <span className="relation__target form__hint">{describeEffect(effect)}</span>
                    </>
                  )}
                  <button type="button" className="button" aria-label="効果を外す"
                    onClick={() => setEffects(tech.effects.filter((_, j) => j !== i))}>×</button>
                </div>
              ))}
              <button type="button" className="button" onClick={() => setEffects([...tech.effects, { kind: 'etc', value: '' }])}>
                ＋ 効果を追加
              </button>
            </div>
          </div>
        )}

        <div className="panel">
          <TechTree techs={techs} selectedId={selectedId} onSelect={setSelectedId} />
        </div>
      </section>
    </div>
  )
}
