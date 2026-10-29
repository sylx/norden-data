import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BUILDING_EFFECT_LABELS, describeEffect, type BuildingEffect, type BuildingEffectKind,
} from '@game/data/buildings.ts'
import { TECH_BRANCH_LABELS, type TechBranch } from '@game/data/techs.ts'
import { api, errorMessage } from '../api'
import { Field, NumberField, SaveStatus, TagsField } from '../fields'
import { useLeaveGuard } from '../useDirty'
import { SheetCrop } from '../characters/SheetCrop'
import { SpritePicker } from '../characters/SpritePicker'
import { cellRect, type SheetInfo } from '../characters/types'
import type { SourceTech } from '../techs/types'
import { createBuilding, isBuildingId, upgradeCycle, type SourceBuilding } from './types'

const EFFECT_KINDS = Object.keys(BUILDING_EFFECT_LABELS) as BuildingEffectKind[]

/** 効果の値の入力の範囲と刻み（ないものは割合などで、範囲を決めない） */
const EFFECT_INPUTS: Partial<Record<BuildingEffectKind, { min: number; max: number; step: number }>> = {
  tradeRoutes: { min: 1, max: 6, step: 1 },
}
const clampEffect = (kind: BuildingEffectKind, value: number) => {
  const input = EFFECT_INPUTS[kind]
  return input ? Math.min(input.max, Math.max(input.min, Math.round(value))) : value
}

/** 種類を kind に変えた効果。前の値は引き継げるときだけ引き継ぐ（その他はテキスト、ほかは数。研究は系統も持つ） */
function withKind(effect: BuildingEffect, kind: BuildingEffectKind): BuildingEffect {
  if (kind === 'etc') return { kind, value: effect.kind === 'etc' ? effect.value : '' }
  const value = clampEffect(kind, effect.kind === 'etc' ? 10 : effect.value)
  if (kind === 'researchPoints') return { kind, value, branch: effect.kind === 'researchPoints' ? effect.branch : 'physical' }
  return { kind, value }
}

/** server/exportBuildings.ts の ExportResult */
interface ExportResult {
  buildingCount: number
  noImage: { id: string; name: string }[]
  imageSize: string
  imageBytes: number
  files: string[]
}

/** 施設の画像。square は幅に合わせて上下を切った正方形（一覧の小さい画像） */
function BuildingThumb({ building, sheets, width, square, className = '' }: {
  building: SourceBuilding
  sheets: ReadonlyMap<string, SheetInfo>
  width: number
  square?: boolean
  className?: string
}) {
  const sheet = building.sprite && sheets.get(building.sprite.sheet)
  if (!sheet || !building.sprite) {
    return <div className={`sheet-crop sheet-crop--empty ${className}`} style={{ width, height: square ? width : width * 1.5 }}>?</div>
  }
  const cell = cellRect(sheet, building.sprite.col, building.sprite.row)
  const rect = square ? { ...cell, y: cell.y + (cell.height - cell.width) / 2, height: cell.width } : cell
  return <SheetCrop sheet={sheet} rect={rect} width={width} base="/building-sheets" className={className} />
}

/**
 * 施設データの元データ（buildings/buildings.json）を編集し、ゲームのデータに書き出す。左に一覧、右に画像と入力。
 * 画像は buildings/sources/ の元画像（横 5 × 縦 4）のセルを選び、書き出しで buildings.webp に並べ直す
 */
export function BuildingEditor() {
  const [buildings, setBuildings] = useState<SourceBuilding[] | null>(null)
  const [sheets, setSheets] = useState<SheetInfo[]>([])
  const [savedJson, setSavedJson] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [newId, setNewId] = useState('')
  const [status, setStatus] = useState<{ message?: string; error?: string }>({})
  const [exported, setExported] = useState<ExportResult | null>(null)
  const [busy, setBusy] = useState(false)
  /** 必要な技術に選べる技術（技術データの元データ） */
  const [techs, setTechs] = useState<SourceTech[]>([])

  const loadSheets = useCallback(() => api<SheetInfo[]>('/api/building-sheets').then(
    setSheets,
    (e) => setStatus({ error: errorMessage(e) }),
  ), [])

  const load = useCallback(() => api<SourceBuilding[]>('/api/buildings').then(
    (list) => {
      setBuildings(list)
      setSavedJson(JSON.stringify(list))
      setSelectedId((id) => (list.some((b) => b.id === id) ? id : list[0]?.id ?? ''))
      setStatus({})
    },
    (e) => setStatus({ error: errorMessage(e) }),
  ), [])
  useEffect(() => { load(); loadSheets() }, [load, loadSheets])
  useEffect(() => { api<SourceTech[]>('/api/techs').then(setTechs, (e) => setStatus({ error: errorMessage(e) })) }, [])

  const dirty = buildings !== null && JSON.stringify(buildings) !== savedJson
  useLeaveGuard(dirty)

  const sheetMap = useMemo(() => new Map(sheets.map((s) => [s.file, s])), [sheets])
  const nameOf = (id: string) => buildings?.find((b) => b.id === id)?.name ?? id

  const save = async (list = buildings) => {
    if (!list) return false
    try {
      await api('/api/buildings', { method: 'PUT', body: list })
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
      const result = await api<ExportResult>('/api/buildings/export', { method: 'POST' })
      setExported(result)
      setStatus({ message: `書き出しました（${new Date().toLocaleTimeString()}）` })
    } catch (e) {
      setStatus({ error: errorMessage(e) })
    } finally {
      setBusy(false)
    }
  }

  const building = buildings?.find((b) => b.id === selectedId)
  const update = (patch: Partial<SourceBuilding>) =>
    setBuildings((list) => list && list.map((b) => (b.id === selectedId ? { ...b, ...patch } : b)))
  const setEffects = (effects: BuildingEffect[]) => update({ effects })

  const idProblem = (() => {
    if (!newId) return null
    if (!isBuildingId(newId)) return 'ID は英小文字で始め、英小文字・数字・_ にしてください'
    if (buildings?.some((b) => b.id === newId)) return 'その ID はもうあります'
    return null
  })()

  const add = () => {
    if (!newId || idProblem) return
    setBuildings((list) => list && [...list, createBuilding(newId)])
    setSelectedId(newId)
    setNewId('')
  }

  /** 削除した施設をアップグレード元にしていた施設は、アップグレードでなくなる */
  const remove = () => {
    if (!buildings || !building) return
    const upgrades = buildings.filter((b) => b.upgradeFrom === building.id)
    const note = upgrades.length ? `\n${upgrades.map((b) => b.name).join('・')}のアップグレード元からも外します。` : ''
    if (!confirm(`${building.name}（${building.id}）を削除しますか？${note}\n拠点の初期の施設に入っていれば、そこには残ります`)) return
    const rest = buildings.filter((b) => b.id !== building.id)
      .map((b) => (b.upgradeFrom === building.id ? { ...b, upgradeFrom: undefined } : b))
    setBuildings(rest)
    setSelectedId(rest[0]?.id ?? '')
  }

  if (!buildings) return <div className="loading">{status.error ?? '読み込み中…'}</div>

  /** アップグレード元に選べる施設（自分と、選ぶと循環するものを除く） */
  const upgradeSources = building
    ? buildings.filter((b) => b.id !== building.id
      && !upgradeCycle(buildings.map((x) => (x.id === building.id ? { ...x, upgradeFrom: b.id } : x)), building.id))
    : []
  const upgradesTo = building ? buildings.filter((b) => b.upgradeFrom === building.id) : []

  return (
    <div className="character-editor">
      <aside className="character-list panel">
        <div className="toolbar">
          <input className="toolbar__search" value={newId} placeholder="新しい施設の ID（例: library）"
            onChange={(e) => setNewId(e.target.value.trim())} onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
          <button type="button" className="button" disabled={!newId || !!idProblem} onClick={add}>追加</button>
        </div>
        {idProblem && <span className="save-status save-status--error">{idProblem}</span>}
        <ul className="character-list__items">
          {buildings.map((b) => (
            <li key={b.id}>
              <button type="button" className={`character-list__item ${b.id === selectedId ? 'is-selected' : ''}`}
                onClick={() => setSelectedId(b.id)}>
                <BuildingThumb building={b} sheets={sheetMap} width={40} square className="building-list__image" />
                <span className="character-list__text">
                  <span className="character-list__name">{b.name}</span>
                  <span className="character-list__sub">
                    {[
                      b.id,
                      b.requiredTags?.length && b.requiredTags.join('・'),
                      b.upgradeFrom && `${nameOf(b.upgradeFrom)}から`,
                      b.requiredRelic && `遺物「${b.requiredRelic}」`,
                      b.requiredTech && `技術「${techs.find((t) => t.id === b.requiredTech)?.name ?? b.requiredTech}」`,
                      b.effects.map(describeEffect).join('・') || '効果なし',
                    ].filter(Boolean).join(' / ')}
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
          <button type="button" className="button button--accent" disabled={busy} onClick={exportToGame}
            title="保存してから、ゲームの buildingData.json・buildingSprite.json・buildings.webp に書き出す">ゲームに書き出す</button>
          <button type="button" className="button" onClick={loadSheets}>画像を読み直す</button>
          <SaveStatus dirty={dirty} {...status} />
        </div>

        {exported && (
          <div className="notice notice--ok">
            {exported.buildingCount}件を書き出しました（{exported.imageSize}、{(exported.imageBytes / 1024).toFixed(0)} KB）
            {exported.noImage.length > 0 && <div>画像が未設定: {exported.noImage.map((b) => `${b.id} ${b.name}`).join('、')}</div>}
            <ul className="notice__files">{exported.files.map((f) => <li key={f}>{f}</li>)}</ul>
          </div>
        )}

        {building && (
          <div className="character-form">
            <div className="character-form__images panel">
              <h3 className="form__heading">画像</h3>
              <SpritePicker sheets={sheets} item={building} items={buildings} base="/building-sheets" dir="buildings/sources/"
                onPick={(sprite) => update({ sprite })} />
              {building.sprite && <BuildingThumb building={building} sheets={sheetMap} width={128} className="building-preview" />}
            </div>

            <div className="character-form__data panel form">
              <h2 className="form__title">
                {building.name}<span className="form__id">{building.id}</span>
                <button type="button" className="button button--danger form__delete" onClick={remove}>削除</button>
              </h2>

              <div className="form__grid">
                <Field label="名前"><input value={building.name} onChange={(e) => update({ name: e.target.value })} /></Field>
                <Field label="アップグレード元">
                  <select value={building.upgradeFrom ?? ''} onChange={(e) => update({ upgradeFrom: e.target.value || undefined })}>
                    <option value="">なし（空きスロットに建てる）</option>
                    {building.upgradeFrom && !buildings.some((b) => b.id === building.upgradeFrom) && (
                      <option value={building.upgradeFrom}>{building.upgradeFrom}（見つかりません）</option>
                    )}
                    {upgradeSources.map((b) => <option key={b.id} value={b.id}>{b.name}（{b.id}）</option>)}
                  </select>
                </Field>
                <Field label="必要な遺物">
                  <input value={building.requiredRelic ?? ''} placeholder="なし"
                    onChange={(e) => update({ requiredRelic: e.target.value || undefined })} />
                </Field>
                <Field label="必要な技術">
                  <select value={building.requiredTech ?? ''} onChange={(e) => update({ requiredTech: e.target.value || undefined })}>
                    <option value="">なし</option>
                    {building.requiredTech && !techs.some((t) => t.id === building.requiredTech) && (
                      <option value={building.requiredTech}>{building.requiredTech}（見つかりません）</option>
                    )}
                    {techs.map((t) => <option key={t.id} value={t.id}>{t.name}（{t.id}）</option>)}
                  </select>
                </Field>
                <Field label="必要なタグ（どれか）" wide>
                  <TagsField value={building.requiredTags ?? []}
                    onChange={(tags) => update({ requiredTags: tags.length ? tags : undefined })} />
                </Field>
                <Field label="説明（フレーバーテキスト）" wide>
                  <textarea rows={3} value={building.description} onChange={(e) => update({ description: e.target.value })} />
                </Field>
              </div>
              {building.upgradeFrom && (
                <p className="form__hint">{nameOf(building.upgradeFrom)}が建っている都市で、その上に建てる（スロットは増えない）</p>
              )}
              {building.requiredRelic && (
                <p className="form__hint">遺物の所持はまだゲームに無いので、今は建てられない</p>
              )}
              {building.requiredTech && (
                <p className="form__hint">勢力がこの技術を研究し終えるまで、建てられる施設に出ない</p>
              )}
              {upgradesTo.length > 0 && (
                <p className="form__hint">アップグレード先: {upgradesTo.map((b) => b.name).join('・')}</p>
              )}

              <h3 className="form__heading">費用</h3>
              <NumberField label="物資" value={building.supplies} max={3000} step={10} onChange={(supplies) => update({ supplies })} />
              <NumberField label="金" value={building.gold} max={1000} step={10} onChange={(gold) => update({ gold })} />

              <h3 className="form__heading">効果</h3>
              {building.effects.map((effect, i) => (
                <div key={i} className="relation">
                  <select value={effect.kind} onChange={(e) => setEffects(building.effects.map((ef, j) => (
                    j === i ? withKind(ef, e.target.value as BuildingEffectKind) : ef)))}>
                    {EFFECT_KINDS.map((k) => <option key={k} value={k}>{BUILDING_EFFECT_LABELS[k]}</option>)}
                  </select>
                  {effect.kind === 'etc' ? (
                    <input className="relation__target" value={effect.value} placeholder="ゲームではまだ表せない効果"
                      onChange={(e) => setEffects(building.effects.map((ef, j) => (j === i ? { ...effect, value: e.target.value } : ef)))} />
                  ) : (
                    <>
                      <input type="number" className="number-field__input building-effect__value" value={effect.value}
                        min={EFFECT_INPUTS[effect.kind]?.min} max={EFFECT_INPUTS[effect.kind]?.max} step={EFFECT_INPUTS[effect.kind]?.step ?? 5}
                        onChange={(e) => setEffects(building.effects.map((ef, j) => (
                          j === i ? { ...effect, value: clampEffect(effect.kind, e.target.value === '' ? 0 : Number(e.target.value)) } : ef)))} />
                      {effect.kind === 'researchPoints' && (
                        <select value={effect.branch} aria-label="系統"
                          onChange={(e) => setEffects(building.effects.map((ef, j) => (j === i ? { ...effect, branch: e.target.value as TechBranch } : ef)))}>
                          {(Object.keys(TECH_BRANCH_LABELS) as TechBranch[]).map((b) => <option key={b} value={b}>{TECH_BRANCH_LABELS[b]}</option>)}
                        </select>
                      )}
                      <span className="relation__target form__hint">{describeEffect(effect)}</span>
                    </>
                  )}
                  <button type="button" className="button" aria-label="効果を外す"
                    onClick={() => setEffects(building.effects.filter((_, j) => j !== i))}>×</button>
                </div>
              ))}
              <button type="button" className="button" onClick={() => setEffects([...building.effects, { kind: 'marketPct', value: 10 }])}>
                ＋ 効果を追加
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
