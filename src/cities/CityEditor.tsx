import { useCallback, useEffect, useMemo, useState } from 'react'
import { ROAD_LINKS } from 'norden-strategy/data'
import type { City } from '@game/data/city.ts'
import { api, errorMessage } from '../api'
import type { SourceCharacter } from '../characters/types'
import { FACTIONS, characterFaction, factionColor, factionName } from '../factions'
import { Field, NumberField, SaveStatus, TagsField } from '../fields'
import { useLeaveGuard } from '../useDirty'
import { MiniMap } from './MiniMap'

/** 都市の種別（ゲームの src/scenes/strategy/views.ts の CITY_TYPE_LABELS と同じ） */
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

  const members = characters.filter((c) => c.start?.cityId === selectedId)
  const knights = members.filter((c) => !c.mercenaryInfo)
  const mercenaries = members.filter((c) => c.mercenaryInfo)
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
          {factionId !== city?.belongTo && <span className="chip__note">{factionName(factionId)}</span>}
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
              <Field label="所属（初期）">
                <select value={city.belongTo ?? ''} onChange={(e) => update({ belongTo: e.target.value || undefined })}>
                  <option value="">中立</option>
                  {FACTIONS.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </Field>
            </div>

            <h3 className="form__heading">数値</h3>
            <NumberField label="人口" value={city.population} max={30000} step={100} onChange={(population) => update({ population })} />
            <NumberField label="農業" value={city.agriculture} max={1000} step={10} onChange={(agriculture) => update({ agriculture })} />
            <NumberField label="商業" value={city.market} max={1000} step={10} onChange={(market) => update({ market })} />
            <NumberField label="生産" value={city.production} max={1000} step={10} onChange={(production) => update({ production })} />

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
