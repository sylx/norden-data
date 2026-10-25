import { useCallback, useEffect, useMemo, useState } from 'react'
import { ROAD_LINKS } from 'norden-strategy/data'
import type { City } from '@game/data/city.ts'
import { api, errorMessage } from '../api'
import type { SourceBuilding } from '../buildings/types'
import type { SourceCharacter } from '../characters/types'
import { FACTIONS, characterFaction, factionColor, factionName } from '../factions'
import { Field, NumberField, OptionalNumberField, SaveStatus, TagsField } from '../fields'
import { useLeaveGuard } from '../useDirty'
import { MiniMap } from './MiniMap'
import { citySlots, INITIAL_MORALE, INITIAL_SUPPLIES_PER_PRODUCTION, INITIAL_TROOPS_PER_PRODUCTION, tierOf } from './rules'

/** 都市の種別（ゲームの src/scenes/strategy/views.ts の CITY_TYPE_LABELS と同じ） */
/** 地図の絵を固定する都市（聖地・要塞）。規模と施設のスロットが Tier に従わない */
const IMAGE_LABELS: Readonly<Record<NonNullable<City['image']>, string>> = { temple: '聖地', fortress1: '要塞1', fortress2: '要塞2' }

const CITY_TYPES: readonly [string, string][] = [
  ['pope_city', '聖都'],
  ['port_city', '港湾都市'],
  ['farm_city', '農業都市'],
  ['trade_city', '交易都市'],
  ['military_city', '軍事都市'],
  ['ruin_city', '遺跡都市'],
  ['frontier_city', '辺境都市'],
]

/** 拠点データ（ルートの src/data/cityData.json）を直接読み書きする。左に入力、右に地図 */
export function CityEditor({ active }: { active: boolean }) {
  const [cities, setCities] = useState<City[] | null>(null)
  const [savedJson, setSavedJson] = useState('')
  const [selectedId, setSelectedId] = useState('P000')
  const [status, setStatus] = useState<{ message?: string; error?: string }>({})
  /** 保存済みの騎士データ（所属騎士の表示だけに使う）。タブを開くたびに読み直す */
  const [characters, setCharacters] = useState<SourceCharacter[]>([])
  /** 保存済みの施設データ（初期の施設の選択肢）。タブを開くたびに読み直す */
  const [buildings, setBuildings] = useState<SourceBuilding[]>([])

  const load = useCallback(() => api<City[]>('/api/cities').then(
    (list) => {
      setCities(list)
      setSavedJson(JSON.stringify(list))
      setStatus({})
    },
    (e) => setStatus({ error: errorMessage(e) }),
  ), [])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!active) return
    api<SourceCharacter[]>('/api/characters').then(setCharacters, (e) => setStatus({ error: errorMessage(e) }))
    api<SourceBuilding[]>('/api/buildings').then(setBuildings, (e) => setStatus({ error: errorMessage(e) }))
  }, [active])

  const dirty = cities !== null && JSON.stringify(cities) !== savedJson
  useLeaveGuard(dirty)

  const save = async () => {
    if (!cities) return
    try {
      await api('/api/cities', { method: 'PUT', body: cities })
      setSavedJson(JSON.stringify(cities))
      setStatus({ message: `保存しました（${new Date().toLocaleTimeString()}）` })
    } catch (e) {
      setStatus({ error: errorMessage(e) })
    }
  }

  const city = cities?.find((c) => c.id === selectedId)
  const update = (patch: Partial<City>) =>
    setCities((list) => list && list.map((c) => (c.id === selectedId ? { ...c, ...patch } : c)))

  const neighbours = useMemo(
    () => ROAD_LINKS.flatMap(([a, b]) => (a === selectedId ? [b] : b === selectedId ? [a] : [])),
    [selectedId],
  )

  const tier = city ? tierOf(city.population) : 1
  const slots = city ? citySlots(city) : 0
  const built = city?.buildings ?? []
  const toggleBuilding = (id: string, on: boolean) => {
    const next = on ? [...built, id] : built.filter((b) => b !== id)
    update({ buildings: next.length ? next : undefined })
  }

  const members = characters.filter((c) => c.start?.cityId === selectedId)
  const prisoners = members.filter((c) => c.start?.isPrisoner)
  const knights = members.filter((c) => !c.mercenaryInfo && !c.start?.isPrisoner)
  const mercenaries = members.filter((c) => c.mercenaryInfo && !c.start?.isPrisoner)
  /** 都市の勢力と違う勢力に仕える騎士は、勢力名を添える */
  const memberChip = (c: SourceCharacter) => {
    const factionId = characterFaction(c, () => city?.belongTo)
    return (
      <li key={c.id}>
        <span className="chip chip--static">
          <span className="swatch" style={{ background: factionColor(factionId) }} />
          {c.name}
          {c.start?.isLord && <span className="chip__note">領主</span>}
          {c.mercenaryInfo && <span className="chip__note">{c.mercenaryInfo.name || '傭兵団'}</span>}
          {c.start?.isPrisoner
            ? <span className="chip__note">{factionId ? factionName(factionId) : '所属なし'}</span>
            : factionId !== city?.belongTo && <span className="chip__note">{factionName(factionId)}</span>}
        </span>
      </li>
    )
  }

  if (!cities) return <div className="loading">{status.error ?? '読み込み中…'}</div>

  return (
    <div className="city-editor">
      <section className="city-editor__form panel">
        <div className="toolbar">
          <select className="toolbar__select" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            {cities.map((c) => <option key={c.id} value={c.id}>{c.id} {c.name}</option>)}
          </select>
          <button type="button" className="button button--primary" disabled={!dirty} onClick={save}>保存</button>
          <button type="button" className="button" disabled={!dirty}
            onClick={() => { if (confirm('保存していない変更を捨てて読み込み直しますか？')) load() }}>元に戻す</button>
        </div>
        <SaveStatus dirty={dirty} {...status} />

        {city && (
          <div className="form">
            <h2 className="form__title">
              <span className="swatch swatch--large" style={{ background: factionColor(city.belongTo) }} />
              {city.name}<span className="form__id">{city.id}</span>
            </h2>

            <div className="form__grid">
              <Field label="名前"><input value={city.name} onChange={(e) => update({ name: e.target.value })} /></Field>
              <Field label="英名"><input value={city.nameEn} onChange={(e) => update({ nameEn: e.target.value })} /></Field>
              <Field label="種別">
                <select value={city.type} onChange={(e) => update({ type: e.target.value })}>
                  {CITY_TYPES.some(([id]) => id === city.type) ? null : <option value={city.type}>{city.type}</option>}
                  {CITY_TYPES.map(([id, label]) => <option key={id} value={id}>{label}（{id}）</option>)}
                </select>
              </Field>
              <Field label="固定の絵">
                <select value={city.image ?? ''}
                  onChange={(e) => update({ image: (e.target.value || undefined) as City['image'] })}>
                  <option value="">なし（Tier で変わる）</option>
                  {Object.entries(IMAGE_LABELS).map(([id, label]) => <option key={id} value={id}>{label}（{id}）</option>)}
                </select>
              </Field>
              <Field label="所属（初期）">
                <select value={city.belongTo ?? ''} onChange={(e) => update({ belongTo: e.target.value || undefined })}>
                  <option value="">中立</option>
                  {FACTIONS.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </Field>
            </div>

            <h3 className="form__heading">数値</h3>
            <NumberField label="人口" value={city.population} max={60000} step={100} onChange={(population) => update({ population })} />
            <p className="form__note">
              {city.image ? `${IMAGE_LABELS[city.image]}のため規模は固定（施設のスロット ${slots}）` : `Tier ${tier}（施設のスロット ${slots}）`}
            </p>
            <NumberField label="商業" value={city.market} max={1000} step={10} onChange={(market) => update({ market })} />
            <NumberField label="生産" value={city.production} max={1000} step={10} onChange={(production) => update({ production })} />

            <h3 className="form__heading">初期の状態</h3>
            <OptionalNumberField label="備蓄" value={city.storedSupplies} max={5000} step={10}
              fallback={city.production * INITIAL_SUPPLIES_PER_PRODUCTION} fallbackNote={`生産 × ${INITIAL_SUPPLIES_PER_PRODUCTION}`}
              onChange={(storedSupplies) => update({ storedSupplies })} />
            <OptionalNumberField label="兵数" value={city.troops} max={10000} step={10}
              fallback={city.production * INITIAL_TROOPS_PER_PRODUCTION} fallbackNote={`生産 × ${INITIAL_TROOPS_PER_PRODUCTION}`}
              onChange={(troops) => update({ troops })} />
            <OptionalNumberField label="練度" value={city.troopMorale} max={100}
              fallback={INITIAL_MORALE} fallbackNote={String(INITIAL_MORALE)}
              onChange={(troopMorale) => update({ troopMorale })} />
            <Field label={`施設（${built.length} / ${slots}）`} wide>
              <ul className="chips">
                {buildings.map((b) => {
                  const on = built.includes(b.id)
                  const why = b.upgradeFrom && on && built.includes(b.upgradeFrom) ? `${buildings.find((x) => x.id === b.upgradeFrom)?.name ?? b.upgradeFrom}と重複`
                    : b.requiredTags && !b.requiredTags.some((t) => city.tags.includes(t)) ? `${b.requiredTags.join('・')}のみ`
                    : b.requiredRelic ? `遺物「${b.requiredRelic}」` : null
                  return (
                    <li key={b.id}>
                      <label className={`chip chip--check ${on ? 'is-on' : ''}`} title={why ?? undefined}>
                        <input type="checkbox" checked={on} onChange={(e) => toggleBuilding(b.id, e.target.checked)} />
                        {b.name}
                        {why && <span className="chip__note">{why}</span>}
                      </label>
                    </li>
                  )
                })}
                {built.filter((id) => !buildings.some((b) => b.id === id)).map((id) => (
                  <li key={id}>
                    <label className="chip chip--check is-on chip--missing">
                      <input type="checkbox" checked onChange={() => toggleBuilding(id, false)} />{id}
                      <span className="chip__note">施設データに無い</span>
                    </label>
                  </li>
                ))}
              </ul>
              {built.length > slots && <span className="save-status save-status--error">スロットより多い施設があります</span>}
            </Field>

            <h3 className="form__heading">その他</h3>
            <Field label="特殊" wide>
              <input value={city.special ?? ''} placeholder="なし" onChange={(e) => update({ special: e.target.value || undefined })} />
            </Field>
            <Field label="タグ" wide>
              <TagsField value={city.tags} onChange={(tags) => update({ tags })} />
            </Field>

            <h3 className="form__heading">所属騎士（騎士 {knights.length}人・傭兵 {mercenaries.length}人）</h3>
            {knights.length > 0 && <ul className="chips">{knights.map(memberChip)}</ul>}
            {mercenaries.length > 0 && <ul className="chips">{mercenaries.map(memberChip)}</ul>}
            {prisoners.length > 0 && <>
              <h3 className="form__heading">捕虜（{prisoners.length}人）</h3>
              <ul className="chips">{prisoners.map(memberChip)}</ul>
            </>}

            <h3 className="form__heading">街道でつながる拠点</h3>
            <ul className="chips">
              {neighbours.map((id) => {
                const other = cities.find((c) => c.id === id)
                return (
                  <li key={id}>
                    <button type="button" className="chip" onClick={() => setSelectedId(id)}>
                      <span className="swatch" style={{ background: factionColor(other?.belongTo) }} />{other?.name ?? id}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </section>
      <section className="city-editor__map panel">
        <MiniMap cities={cities} characters={characters} selectedId={selectedId} onSelect={setSelectedId} />
      </section>
    </div>
  )
}
