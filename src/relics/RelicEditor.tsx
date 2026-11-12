import { useCallback, useEffect, useMemo, useState } from 'react'
import { ATTACK_DEFS } from '@norden/battle-runtime/rules'
import { isSpecialCharacterId } from '@game/data/character.ts'
import {
  RELIC_RARITIES, RELIC_USE_LABELS, RELIC_WEARER_LABELS, relicEffectProblems, SPELL_IDS,
  type RelicEquipment, type RelicRarity, type RelicSummon, type RelicUse, type RelicWearer, type RelicWorkCost,
} from '@game/data/relics.ts'
import { MONSTER_UNIT_TYPES, UNIT_TYPE_MAP, UNIT_TYPES, type UnitTypeId } from '@game/data/unitTypes.ts'
import { api, errorMessage } from '../api'
import type { SourceBuilding } from '../buildings/types'
import type { SourceCharacter } from '../characters/types'
import { Field, NumberField, SaveStatus } from '../fields'
import { useLeaveGuard } from '../useDirty'
import { SheetCrop } from '../characters/SheetCrop'
import { SpritePicker } from '../characters/SpritePicker'
import { cellRect, type SheetInfo } from '../characters/types'
import type { SheetCell } from '../buildings/types'
import type { SourceTech } from '../techs/types'
import { createRelic, isRelicId, relicProblems, type SourceRelic } from './types'

const USES = Object.keys(RELIC_USE_LABELS) as RelicUse[]
const WEARERS = Object.keys(RELIC_WEARER_LABELS) as RelicWearer[]
/** 装備で増やせる兵種（騎士の率いる兵種。歩兵は誰でも率いるので除く） */
const EQUIPMENT_UNIT_TYPES = UNIT_TYPES.filter((t) => t.id !== 'infantry' && !MONSTER_UNIT_TYPES.includes(t.id))

/** 使い道を変えたときの効果: 装備・召喚の効果は使い道に合うものだけを残し、無ければ既定を入れる */
const effectsFor = (use: RelicUse, relic: SourceRelic): Pick<SourceRelic, 'use' | 'equipment' | 'summon'> => ({
  use,
  equipment: use === 'equipment' ? relic.equipment ?? { wearer: 'nonMagician', unitTypes: [] } : undefined,
  summon: use === 'summon' ? relic.summon ?? { characterId: '991', unitType: 'dragon', hp: 600 } : undefined,
})

/** 一覧の切り替え: 入っていれば外し、無ければ足す（順は元の一覧の順） */
const toggled = <T,>(list: readonly T[] | undefined, item: T, all: readonly T[]): T[] | undefined => {
  const next = list?.includes(item) ? list.filter((x) => x !== item) : [...(list ?? []), item]
  return next.length ? all.filter((x) => next.includes(x)) : undefined
}

/** 装備の効果: 付けられる騎士・知力の制限・増える兵種・使える魔法 */
function EquipmentFields({ equipment, onChange }: { equipment: RelicEquipment; onChange: (equipment: RelicEquipment) => void }) {
  const set = (patch: Partial<RelicEquipment>) => onChange({ ...equipment, ...patch })
  return (
    <>
      <div className="form__grid">
        <Field label="付けられる騎士">
          <select value={equipment.wearer} onChange={(e) => set({ wearer: e.target.value as RelicWearer })}>
            {WEARERS.map((w) => <option key={w} value={w}>{RELIC_WEARER_LABELS[w]}</option>)}
          </select>
        </Field>
      </div>
      <p className="form__note">傭兵・召喚ユニットはどちらでも付けられない</p>
      <label className="checkbox">
        <input type="checkbox" checked={equipment.minIntelligence !== undefined}
          onChange={(e) => set({ minIntelligence: e.target.checked ? 70 : undefined })} />
        知力の制限がある
      </label>
      {equipment.minIntelligence !== undefined && (
        <NumberField label="付けるのに要る知力" value={equipment.minIntelligence} min={1} max={100} onChange={(minIntelligence) => set({ minIntelligence })} />
      )}
      <div className="field field--wide">
        <span className="field__label">率いられるようになる兵種</span>
        <div className="checkbox-row">
          {EQUIPMENT_UNIT_TYPES.map((t) => (
            <label key={t.id} className="checkbox">
              <input type="checkbox" checked={equipment.unitTypes?.includes(t.id) ?? false}
                onChange={() => set({ unitTypes: toggled(equipment.unitTypes, t.id, EQUIPMENT_UNIT_TYPES.map((u) => u.id)) })} />
              {t.name}
            </label>
          ))}
        </div>
      </div>
      <div className="field field--wide">
        <span className="field__label">戦闘で使えるようになる魔法（魔術師の兵種を率いるときだけ。サンダーフォールは魔導書なしで使える）</span>
        <div className="checkbox-row">
          {SPELL_IDS.map((id) => (
            <label key={id} className="checkbox">
              <input type="checkbox" checked={equipment.spells?.includes(id) ?? false}
                onChange={() => set({ spells: toggled(equipment.spells, id, SPELL_IDS) })} />
              {ATTACK_DEFS[id].name}
            </label>
          ))}
        </div>
      </div>
    </>
  )
}

/** 召喚の型紙: 画像と既定の値を持つ特殊キャラクター・魔物の兵種・HP */
function SummonFields({ summon, characters, onChange }: {
  summon: RelicSummon
  characters: readonly SourceCharacter[]
  onChange: (summon: RelicSummon) => void
}) {
  const set = (patch: Partial<RelicSummon>) => onChange({ ...summon, ...patch })
  const specials = characters.filter((c) => isSpecialCharacterId(c.id))
  return (
    <>
      <div className="form__grid">
        <Field label="型紙のキャラクター（画像）">
          <select value={summon.characterId} onChange={(e) => set({ characterId: e.target.value })}>
            {!specials.some((c) => c.id === summon.characterId) && <option value={summon.characterId}>{summon.characterId}（いません）</option>}
            {specials.map((c) => <option key={c.id} value={c.id}>{c.id} {c.name}</option>)}
          </select>
        </Field>
        <Field label="兵種">
          <select value={summon.unitType} onChange={(e) => set({ unitType: e.target.value as UnitTypeId })}>
            {!MONSTER_UNIT_TYPES.includes(summon.unitType) && <option value={summon.unitType}>{UNIT_TYPE_MAP[summon.unitType]?.name ?? summon.unitType}（魔物でない）</option>}
            {MONSTER_UNIT_TYPES.map((id) => <option key={id} value={id}>{UNIT_TYPE_MAP[id].name}</option>)}
          </select>
        </Field>
      </div>
      <NumberField label="HP（召喚ユニットの最大兵力）" value={summon.hp} min={1} max={2000} step={50} onChange={(hp) => set({ hp })} />
      <p className="form__note">統率・武力・知力は召喚したときに乱数で決まる（政治・魅力は 10）。型紙の能力は使わない</p>
    </>
  )
}

/** server/exportRelics.ts の ExportResult */
interface ExportResult {
  relicCount: number
  noImage: { id: string; name: string }[]
  imageSize: string
  imageBytes: number
  files: string[]
}

/** 遺物の画像。square は幅に合わせて上下を切った正方形（一覧の小さい画像） */
function RelicThumb({ cell, sheets, width, square, className = '' }: {
  cell: SheetCell | null | undefined
  sheets: ReadonlyMap<string, SheetInfo>
  width: number
  square?: boolean
  className?: string
}) {
  const sheet = cell && sheets.get(cell.sheet)
  if (!sheet || !cell) {
    return <div className={`sheet-crop sheet-crop--empty ${className}`} style={{ width, height: square ? width : width * 1.5 }}>?</div>
  }
  const rect = cellRect(sheet, cell.col, cell.row)
  return <SheetCrop sheet={sheet} rect={square ? { ...rect, y: rect.y + (rect.height - rect.width) / 2, height: rect.width } : rect} width={width}
    base="/relic-sheets" className={className} />
}

/** 修復か生産の費用。技術は省略できる */
function CostFields({ cost, techs, onChange }: { cost: RelicWorkCost; techs: readonly SourceTech[]; onChange: (cost: RelicWorkCost) => void }) {
  return (
    <>
      <NumberField label="物資（都市の生産を注ぐ）" value={cost.supplies} min={1} max={5000} step={50} onChange={(supplies) => onChange({ ...cost, supplies })} />
      <NumberField label="金（始めるときに払う）" value={cost.gold} max={3000} step={10} onChange={(gold) => onChange({ ...cost, gold })} />
      <Field label="必要な技術">
        <select value={cost.tech ?? ''} onChange={(e) => onChange({ ...cost, tech: e.target.value || undefined })}>
          <option value="">なし</option>
          {cost.tech && !techs.some((t) => t.id === cost.tech) && <option value={cost.tech}>{cost.tech}（ありません）</option>}
          {techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </Field>
    </>
  )
}

/**
 * 遺物データの元データ（relics/relics.json）を編集し、ゲームのデータに書き出す。左に一覧、右に画像と入力。
 * 画像は relics/sources/ の元画像（施設と同じ横 5 × 縦 4）のセルを壊れた状態と修復済みで別に選び、書き出しで relics.webp に並べ直す
 */
export function RelicEditor() {
  const [relics, setRelics] = useState<SourceRelic[] | null>(null)
  const [techs, setTechs] = useState<SourceTech[]>([])
  const [characters, setCharacters] = useState<SourceCharacter[]>([])
  const [buildings, setBuildings] = useState<SourceBuilding[]>([])
  const [sheets, setSheets] = useState<SheetInfo[]>([])
  const [savedJson, setSavedJson] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [newId, setNewId] = useState('')
  const [status, setStatus] = useState<{ message?: string; error?: string }>({})
  const [exported, setExported] = useState<ExportResult | null>(null)
  const [busy, setBusy] = useState(false)

  const loadSheets = useCallback(() => api<SheetInfo[]>('/api/relic-sheets').then(
    setSheets,
    (e) => setStatus({ error: errorMessage(e) }),
  ), [])

  const load = useCallback(() => {
    api<SourceTech[]>('/api/techs').then(setTechs, (e) => setStatus({ error: errorMessage(e) }))
    api<SourceCharacter[]>('/api/characters').then(setCharacters, (e) => setStatus({ error: errorMessage(e) }))
    api<SourceBuilding[]>('/api/buildings').then(setBuildings, (e) => setStatus({ error: errorMessage(e) }))
    return api<SourceRelic[]>('/api/relics').then(
      (list) => {
        setRelics(list)
        setSavedJson(JSON.stringify(list))
        setSelectedId((id) => (list.some((r) => r.id === id) ? id : list[0]?.id ?? ''))
        setStatus({})
      },
      (e) => setStatus({ error: errorMessage(e) }),
    )
  }, [])
  useEffect(() => { load(); loadSheets() }, [load, loadSheets])

  const dirty = relics !== null && JSON.stringify(relics) !== savedJson
  useLeaveGuard(dirty)

  const sheetMap = useMemo(() => new Map(sheets.map((s) => [s.file, s])), [sheets])
  const techName = (id?: string) => (id ? techs.find((t) => t.id === id)?.name ?? id : '技術なし')

  const save = async () => {
    if (!relics) return false
    try {
      await api('/api/relics', { method: 'PUT', body: relics })
      setSavedJson(JSON.stringify(relics))
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
      const result = await api<ExportResult>('/api/relics/export', { method: 'POST' })
      setExported(result)
      setStatus({ message: `書き出しました（${new Date().toLocaleTimeString()}）` })
    } catch (e) {
      setStatus({ error: errorMessage(e) })
    } finally {
      setBusy(false)
    }
  }

  const relic = relics?.find((r) => r.id === selectedId)
  const update = (patch: Partial<SourceRelic>) => setRelics((list) => list && list.map((r) => (r.id === selectedId ? { ...r, ...patch } : r)))

  const idProblem = (() => {
    if (!newId) return null
    if (!isRelicId(newId)) return 'ID は英小文字で始め、英小文字・数字・_ にしてください'
    if (relics?.some((r) => r.id === newId)) return 'その ID はもうあります'
    return null
  })()

  const add = () => {
    if (!newId || idProblem) return
    setRelics((list) => list && [...list, createRelic(newId)])
    setSelectedId(newId)
    setNewId('')
  }

  const remove = () => {
    if (!relics || !relic) return
    if (!confirm(`${relic.name}（${relic.id}）を削除しますか？\n勢力の初期配布に入っていれば、そこには残ります`)) return
    const rest = relics.filter((r) => r.id !== relic.id)
    setRelics(rest)
    setSelectedId(rest[0]?.id ?? '')
  }

  if (!relics) return <div className="loading">{status.error ?? '読み込み中…'}</div>

  // 効果の検査は騎士データ・施設データの元データと比べる（書き出しのサーバーはゲームのコードを読めないので、ここだけで検査する）
  const effectRefs = {
    characterIds: characters.map((c) => c.id),
    buildingRelics: buildings.flatMap((b) => (b.requiredRelic ? [b.requiredRelic] : [])),
  }
  const problems = [
    ...relicProblems(relics, techs.map((t) => t.id)),
    ...relics.flatMap((r) => relicEffectProblems(r, effectRefs).map((p) => `${r.id} ${r.name}: ${p}`)),
  ]
  const hasBroken = relic?.brokenName !== undefined
  // 2 つのピッカーで同じ一覧を見せる（ほかの遺物が使っているセルが分かるように）。壊れた状態は ID に「（壊）」を付ける
  const owners = relics.flatMap((r) => [
    { id: r.id, name: r.name, sprite: r.sprite },
    { id: `${r.id}（壊）`, name: r.brokenName ?? r.name, sprite: r.brokenSprite ?? null },
  ])

  return (
    <div className="character-editor">
      <aside className="character-list panel">
        <div className="toolbar">
          <input className="toolbar__search" value={newId} placeholder="新しい遺物の ID（例: rifle）"
            onChange={(e) => setNewId(e.target.value.trim())} onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
          <button type="button" className="button" disabled={!newId || !!idProblem} onClick={add}>追加</button>
        </div>
        {idProblem && <span className="save-status save-status--error">{idProblem}</span>}
        <ul className="character-list__items">
          {relics.map((r) => (
            <li key={r.id}>
              <button type="button" className={`character-list__item ${r.id === selectedId ? 'is-selected' : ''}`}
                onClick={() => setSelectedId(r.id)}>
                <RelicThumb cell={r.sprite} sheets={sheetMap} width={40} square className="building-list__image" />
                <span className="character-list__text">
                  <span className="character-list__name">{r.name}</span>
                  <span className="character-list__sub">
                    {[
                      r.id,
                      r.rarity,
                      RELIC_USE_LABELS[r.use],
                      r.repair ? `修復 ${techName(r.repair.tech)}` : '修復なし',
                      r.production ? `生産 ${techName(r.production.tech)}` : '生産なし',
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
            title="保存してから、ゲームの relicData.json・relicSprite.json・relics.webp に書き出す">ゲームに書き出す</button>
          <button type="button" className="button" onClick={loadSheets}>画像を読み直す</button>
          <SaveStatus dirty={dirty} {...status} />
        </div>

        {problems.length > 0 && <div className="notice notice--warn">{problems.map((p) => <div key={p}>{p}</div>)}</div>}
        {exported && (
          <div className="notice notice--ok">
            {exported.relicCount}件を書き出しました（{exported.imageSize}、{(exported.imageBytes / 1024).toFixed(0)} KB）
            {exported.noImage.length > 0 && <div>画像が未設定: {exported.noImage.map((r) => `${r.id} ${r.name}`).join('、')}</div>}
            <ul className="notice__files">{exported.files.map((f) => <li key={f}>{f}</li>)}</ul>
          </div>
        )}

        {relic && (
          <div className="character-form">
            <div className="character-form__images panel">
              <h3 className="form__heading">修復済みの画像</h3>
              <SpritePicker sheets={sheets} item={owners.find((o) => o.id === relic.id)!} items={owners} base="/relic-sheets" dir="relics/sources/"
                onPick={(sprite) => update({ sprite })} />
              {relic.sprite && <RelicThumb cell={relic.sprite} sheets={sheetMap} width={128} className="building-preview" />}
              {hasBroken && (
                <>
                  <h3 className="form__heading">壊れた状態の画像</h3>
                  <SpritePicker sheets={sheets} item={owners.find((o) => o.id === `${relic.id}（壊）`)!} items={owners} base="/relic-sheets" dir="relics/sources/"
                    onPick={(brokenSprite) => update({ brokenSprite })} />
                  {relic.brokenSprite && <RelicThumb cell={relic.brokenSprite} sheets={sheetMap} width={128} className="building-preview" />}
                </>
              )}
            </div>

            <div className="character-form__data panel form">
              <h2 className="form__title">
                {relic.name}<span className="form__id">{relic.id}</span>
                <button type="button" className="button button--danger form__delete" onClick={remove}>削除</button>
              </h2>

              <div className="form__grid">
                <Field label="名前（修復済み）"><input value={relic.name} onChange={(e) => update({ name: e.target.value })} /></Field>
                <Field label="レアリティ">
                  <select value={relic.rarity} onChange={(e) => update({ rarity: e.target.value as RelicRarity })}>
                    {RELIC_RARITIES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </Field>
                <Field label="使い道（修復済み）">
                  <select value={relic.use} onChange={(e) => update(effectsFor(e.target.value as RelicUse, relic))}>
                    {USES.map((u) => <option key={u} value={u}>{RELIC_USE_LABELS[u]}</option>)}
                  </select>
                </Field>
                <Field label="説明（フレーバーテキスト）" wide>
                  <textarea rows={3} value={relic.description} onChange={(e) => update({ description: e.target.value })} />
                </Field>
              </div>

              <h3 className="form__heading">効果（{RELIC_USE_LABELS[relic.use]}）</h3>
              {relic.use === 'equipment' && relic.equipment && (
                <EquipmentFields equipment={relic.equipment} onChange={(equipment) => update({ equipment })} />
              )}
              {relic.use === 'summon' && relic.summon && (
                <SummonFields summon={relic.summon} characters={characters} onChange={(summon) => update({ summon })} />
              )}
              {relic.use === 'building' && (
                <p className="form__note">
                  {(() => {
                    const users = buildings.filter((b) => b.requiredRelic === relic.id)
                    return users.length
                      ? `持っていれば ${users.map((b) => b.name).join('・')} を建てられる（建て終わると遺物は無くなる）。施設データの「必要な遺物」で決める`
                      : 'この遺物を「必要な遺物」にした施設がありません（施設データで指定する）'
                  })()}
                </p>
              )}

              <h3 className="form__heading">壊れた状態</h3>
              <label className="checkbox">
                <input type="checkbox" checked={hasBroken}
                  onChange={(e) => update(e.target.checked
                    ? { brokenName: `壊れた${relic.name}`, dismantlePoints: 300, repair: { supplies: 400, gold: 150 }, brokenSprite: null }
                    : { brokenName: undefined, dismantlePoints: undefined, repair: undefined, brokenSprite: undefined })} />
                壊れた状態がある（無い遺物は解体も修復もできず、初期配布は修復済みだけ。魔導書）
              </label>
              {hasBroken && relic.repair && (
                <>
                  <Field label="壊れた状態の名前"><input value={relic.brokenName} onChange={(e) => update({ brokenName: e.target.value })} /></Field>
                  <NumberField label="解体の研究ポイント" value={relic.dismantlePoints ?? 0} max={3000} step={50} onChange={(dismantlePoints) => update({ dismantlePoints })} />
                  <h3 className="form__heading">修復</h3>
                  <CostFields cost={relic.repair} techs={techs} onChange={(repair) => update({ repair })} />
                </>
              )}

              <h3 className="form__heading">生産</h3>
              <label className="checkbox">
                <input type="checkbox" checked={Boolean(relic.production)}
                  onChange={(e) => update({ production: e.target.checked ? { supplies: 400, gold: 150 } : undefined })} />
                生産できる（遺物はいらない。完成品は修復済みでボックスに入る）
              </label>
              {relic.production && <CostFields cost={relic.production} techs={techs} onChange={(production) => update({ production })} />}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
