import { useCallback, useEffect, useMemo, useState } from 'react'
import type { City } from '@game/data/city.ts'
import {
  PERSONALITY_AXES, PERSONALITY_LABELS, VOICE_TONE_GROUPS, VOICE_TONE_LABELS, type PersonalityTag,
} from '@game/data/characterVoice.ts'
import { api, errorMessage } from '../api'
import { FACTIONS, MERCENARY, characterFaction, factionColor, factionName } from '../factions'
import { Field, NumberField, SaveStatus } from '../fields'
import { MiniMap } from '../cities/MiniMap'
import { useLeaveGuard } from '../useDirty'
import { FaceRectEditor } from './FaceRectEditor'
import { CharacterThumb } from './SheetCrop'
import { SpritePicker } from './SpritePicker'
import {
  CHARACTER_TYPES, CHARACTER_TYPE_LABELS, RELATION_LABELS, RELATION_TYPES, STAT_KEYS,
  createCharacter, nextCharacterId, setGender, setRelations, type Relation, type SheetInfo, type SourceCharacter,
} from './types'

const axisIndex = (tag: PersonalityTag) => PERSONALITY_AXES.findIndex((axis) => axis.tags.includes(tag))

/** server/exportCharacters.ts の ExportResult */
interface ExportResult {
  characterCount: number
  skipped: { id: string; name: string }[]
  imageSize: string
  imageBytes: number
  files: string[]
}

/**
 * 騎士データの元データ（characters/characters.json）を編集し、ゲームのデータに書き出す。
 * 左に一覧、右に画像と能力などの入力
 */
export function CharacterEditor() {
  const [characters, setCharacters] = useState<SourceCharacter[] | null>(null)
  const [savedJson, setSavedJson] = useState('')
  const [sheets, setSheets] = useState<SheetInfo[]>([])
  const [cities, setCities] = useState<City[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<{ message?: string; error?: string }>({})
  const [exported, setExported] = useState<ExportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [cityMapOpen, setCityMapOpen] = useState(false)

  const loadSheets = useCallback(() => api<SheetInfo[]>('/api/sheets').then(
    setSheets,
    (e) => setStatus({ error: errorMessage(e) }),
  ), [])

  const load = useCallback(() => Promise.all([api<SourceCharacter[]>('/api/characters'), api<City[]>('/api/cities')]).then(
    ([list, cityList]) => {
      setCharacters(list)
      setSavedJson(JSON.stringify(list))
      setCities(cityList)
      setSelectedId((id) => id || list[0]?.id || '')
      setStatus({})
    },
    (e) => setStatus({ error: errorMessage(e) }),
  ), [])
  useEffect(() => { load(); loadSheets() }, [load, loadSheets])

  const dirty = characters !== null && JSON.stringify(characters) !== savedJson
  useLeaveGuard(dirty)

  const sheetMap = useMemo(() => new Map(sheets.map((s) => [s.file, s])), [sheets])
  const cityOwner = useMemo(() => new Map(cities.map((c) => [c.id, c.belongTo])), [cities])
  const cityName = (id: string) => cities.find((c) => c.id === id)?.name ?? id
  /** 配置先の勢力（省略なら都市の勢力） */
  const factionOf = (c: SourceCharacter) => characterFaction(c, (id) => cityOwner.get(id))

  const save = async (list = characters) => {
    if (!list) return false
    try {
      await api('/api/characters', { method: 'PUT', body: list })
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
      const result = await api<ExportResult>('/api/characters/export', { method: 'POST' })
      setExported(result)
      setStatus({ message: `書き出しました（${new Date().toLocaleTimeString()}）` })
    } catch (e) {
      setStatus({ error: errorMessage(e) })
    } finally {
      setBusy(false)
    }
  }

  const character = characters?.find((c) => c.id === selectedId)
  const update = (patch: Partial<SourceCharacter>) =>
    setCharacters((list) => list && list.map((c) => (c.id === selectedId ? { ...c, ...patch } : c)))
  /** 関係を変える。相手の側の関係も自動でそろえる */
  const updateRelations = (next: Relation[]) => setCharacters((list) => list && setRelations(list, selectedId, next))

  const add = () => {
    if (!characters) return
    const created = createCharacter(nextCharacterId(characters))
    setCharacters([...characters, created])
    setSelectedId(created.id)
  }

  const remove = () => {
    if (!characters || !character || !confirm(`${character.id} ${character.name} を削除しますか？`)) return
    const rest = characters.filter((c) => c.id !== character.id)
    setCharacters(rest)
    setSelectedId(rest[0]?.id ?? '')
  }

  if (!characters) return <div className="loading">{status.error ?? '読み込み中…'}</div>

  const q = search.trim().toLowerCase()
  const filtered = characters.filter((c) => !q || [c.id, c.name, factionName(factionOf(c)), c.start ? cityName(c.start.cityId) : '']
    .some((text) => text.toLowerCase().includes(q)))
  const sheet = character?.sprite ? sheetMap.get(character.sprite.sheet) : undefined
  const relations = character?.relations ?? []
  const personality = character?.personality ?? []

  return (
    <div className="character-editor">
      <aside className="character-list panel">
        <div className="toolbar">
          <input className="toolbar__search" type="search" placeholder="名前・勢力・都市で検索" value={search}
            onChange={(e) => setSearch(e.target.value)} />
          <button type="button" className="button" onClick={add}>＋ 新規</button>
        </div>
        <ul className="character-list__items">
          {filtered.map((c) => (
            <li key={c.id}>
              <button type="button" className={`character-list__item ${c.id === selectedId ? 'is-selected' : ''}`}
                onClick={() => setSelectedId(c.id)}>
                <CharacterThumb character={c} sheets={sheetMap} mode="face" width={40} className="character-list__face" />
                <span className="character-list__text">
                  <span className="character-list__name">{c.name}</span>
                  <span className="character-list__sub">
                    {c.id}・{CHARACTER_TYPE_LABELS[c.type]}
                    {c.start && <> ・<span className="swatch" style={{ background: factionColor(factionOf(c)) }} />{cityName(c.start.cityId)}</>}
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
            title="保存してから、ゲームの characterData.json・characterStart.json・character.webp に書き出す">ゲームに書き出す</button>
          <button type="button" className="button" onClick={loadSheets}>画像を読み直す</button>
          <SaveStatus dirty={dirty} {...status} />
        </div>

        {exported && (
          <div className="notice notice--ok">
            {exported.characterCount}人を書き出しました（{exported.imageSize}、{(exported.imageBytes / 1024).toFixed(0)} KB）
            {exported.skipped.length > 0 && <div>画像が未設定で除いた: {exported.skipped.map((c) => `${c.id} ${c.name}`).join('、')}</div>}
            <ul className="notice__files">{exported.files.map((f) => <li key={f}>{f}</li>)}</ul>
          </div>
        )}

        {character && (
          <div className="character-form">
            <div className="character-form__images panel">
              <h3 className="form__heading">画像</h3>
              <SpritePicker sheets={sheets} character={character} characters={characters}
                onPick={(sprite) => update({ sprite })} />
              {sheet && character.sprite && (
                <>
                  <h3 className="form__heading">顔の範囲</h3>
                  <FaceRectEditor sheet={sheet} col={character.sprite.col} row={character.sprite.row}
                    faceRect={character.faceRect} onChange={(faceRect) => update({ faceRect })} />
                </>
              )}
            </div>

            <div className="character-form__data panel form">
              <h2 className="form__title">
                {character.name}<span className="form__id">{character.id}</span>
                <button type="button" className="button button--danger form__delete" onClick={remove}>削除</button>
              </h2>

              <div className="form__grid">
                <Field label="名前"><input value={character.name} onChange={(e) => update({ name: e.target.value })} /></Field>
                <Field label="種別">
                  <select value={character.type} onChange={(e) => update({ type: e.target.value as SourceCharacter['type'] })}>
                    {CHARACTER_TYPES.map((t) => <option key={t} value={t}>{CHARACTER_TYPE_LABELS[t]}</option>)}
                  </select>
                </Field>
                <Field label="性別">
                  <select value={character.gender ?? ''}
                    onChange={(e) => setCharacters((list) => list && setGender(list, selectedId, (e.target.value || undefined) as SourceCharacter['gender']))}>
                    <option value="">未設定</option>
                    <option value="male">男性</option>
                    <option value="female">女性</option>
                  </select>
                </Field>
                <Field label="口調">
                  <select value={character.voiceTone ?? ''}
                    onChange={(e) => update({ voiceTone: (e.target.value || undefined) as SourceCharacter['voiceTone'] })}>
                    <option value="">未設定</option>
                    {VOICE_TONE_GROUPS.map((g) => (
                      <optgroup key={g.label} label={g.label}>
                        {g.ids.map((id) => <option key={id} value={id}>{VOICE_TONE_LABELS[id]}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </Field>
                <label className="checkbox">
                  <input type="checkbox" checked={!!character.isPatriarch}
                    onChange={(e) => update({ isPatriarch: e.target.checked || undefined })} />
                  勢力の当主
                </label>
              </div>

              <h3 className="form__heading">性格</h3>
              <div className="form__grid">
                {PERSONALITY_AXES.map((axis) => (
                  <Field key={axis.label} label={axis.label}>
                    <select value={personality.find((t) => axis.tags.includes(t)) ?? ''}
                      onChange={(e) => {
                        // この軸のタグを入れ替え、軸の順に並べる
                        const rest = personality.filter((t) => !axis.tags.includes(t))
                        const next = [...rest, ...(e.target.value ? [e.target.value as PersonalityTag] : [])]
                          .sort((a, b) => axisIndex(a) - axisIndex(b))
                        update({ personality: next.length ? next : undefined })
                      }}>
                      <option value="">未設定</option>
                      {axis.tags.map((tag) => <option key={tag} value={tag}>{PERSONALITY_LABELS[tag]}</option>)}
                    </select>
                  </Field>
                ))}
              </div>

              <h3 className="form__heading">能力</h3>
              {STAT_KEYS.map(([key, label]) => (
                <NumberField key={key} label={label} value={character[key]} max={100} onChange={(v) => update({ [key]: v })} />
              ))}

              <h3 className="form__heading">初期配置</h3>
              <div className="form__grid">
                <Field label="都市">
                  <div className="city-select">
                    <select value={character.start?.cityId ?? ''}
                      onChange={(e) => update({ start: e.target.value ? { ...character.start, cityId: e.target.value } : null })}>
                      <option value="">配置しない</option>
                      {cities.map((c) => <option key={c.id} value={c.id}>{c.id} {c.name}</option>)}
                    </select>
                    <button type="button" className="button" onClick={() => setCityMapOpen((open) => !open)}>
                      {cityMapOpen ? '地図を閉じる' : '地図から選ぶ'}
                    </button>
                  </div>
                </Field>
                <Field label="勢力">
                  <select value={character.start?.factionId ?? ''} disabled={!character.start}
                    onChange={(e) => character.start && update({ start: { ...character.start, factionId: e.target.value || undefined } })}>
                    <option value="">
                      {character.mercenaryInfo ? `所属なし（${MERCENARY.name}）` : `都市の勢力（${factionName(character.start ? cityOwner.get(character.start.cityId) : undefined)}）`}
                    </option>
                    {FACTIONS.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </Field>
                <label className="checkbox">
                  <input type="checkbox" checked={!!character.start?.isLord} disabled={!character.start}
                    onChange={(e) => character.start && update({ start: { ...character.start, isLord: e.target.checked || undefined } })} />
                  都市の領主
                </label>
              </div>
              {cityMapOpen && (
                <div className="city-picker">
                  <MiniMap cities={cities} selectedId={character.start?.cityId ?? ''} showTotals={false}
                    onSelect={(cityId) => update({ start: { ...character.start, cityId } })} />
                </div>
              )}

              <h3 className="form__heading">傭兵</h3>
              <label className="checkbox">
                <input type="checkbox" checked={!!character.mercenaryInfo}
                  onChange={(e) => update({ mercenaryInfo: e.target.checked ? { name: '', fee: 1000 } : undefined })} />
                傭兵団を率いる
              </label>
              {character.mercenaryInfo && (
                <div className="form__grid">
                  <Field label="傭兵団の名前">
                    <input value={character.mercenaryInfo.name}
                      onChange={(e) => update({ mercenaryInfo: { ...character.mercenaryInfo!, name: e.target.value } })} />
                  </Field>
                  <Field label="報酬">
                    <input type="number" value={character.mercenaryInfo.fee}
                      onChange={(e) => update({ mercenaryInfo: { ...character.mercenaryInfo!, fee: Number(e.target.value) } })} />
                  </Field>
                </div>
              )}

              <h3 className="form__heading">関係</h3>
              {relations.map((rel, i) => (
                <div key={i} className="relation">
                  <select value={rel.relation} onChange={(e) => updateRelations(
                    relations.map((r, j) => (j === i ? { ...r, relation: e.target.value as typeof r.relation } : r)),
                  )}>
                    {RELATION_TYPES.map((r) => <option key={r} value={r}>{RELATION_LABELS[r]}</option>)}
                  </select>
                  <select className="relation__target" value={rel.characterId} onChange={(e) => updateRelations(
                    relations.map((r, j) => (j === i ? { ...r, characterId: e.target.value } : r)),
                  )}>
                    <option value="">-- 相手 --</option>
                    {characters.filter((c) => c.id !== character.id).map((c) => <option key={c.id} value={c.id}>{c.id} {c.name}</option>)}
                  </select>
                  <button type="button" className="button" aria-label="関係を外す"
                    onClick={() => updateRelations(relations.filter((_, j) => j !== i))}>×</button>
                </div>
              ))}
              <button type="button" className="button" onClick={() => updateRelations([...relations, { relation: 'father', characterId: '' }])}>
                ＋ 関係を追加
              </button>

              <h3 className="form__heading">略歴</h3>
              <textarea rows={6} value={character.biography ?? ''} onChange={(e) => update({ biography: e.target.value || undefined })} />
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
