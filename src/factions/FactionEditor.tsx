import { useCallback, useEffect, useState } from 'react'
import { EMBLEM_NUMBERS, FACTION_LIST as MAP_FACTION_LIST, emblemImage } from 'norden-strategy/data'
import type { City } from '@game/data/city.ts'
import type { Faction, FactionRelic } from '@game/data/faction.ts'
import { INITIAL_GOLD } from '@game/game/economy/balance.ts'
import { api, errorMessage } from '../api'
import type { SourceCharacter } from '../characters/types'
import type { SourceRelic } from '../relics/types'
import { createFaction, isFactionId } from './types'
import { characterFaction } from '../factions'
import { Field, OptionalNumberField, SaveStatus } from '../fields'
import { useLeaveGuard } from '../useDirty'

/** 地図（norden-strategy の FACTION_LIST）の写しと違うところ。ゲームのテストで比べる */
function mapCopyProblems(factions: readonly Faction[]): string[] {
  const problems: string[] = []
  const map = new Map(MAP_FACTION_LIST.map((f) => [f.id, f]))
  for (const f of factions) {
    const copy = map.get(f.id)
    if (!copy) problems.push(`${f.name}（${f.id}）が無い`)
    else if (copy.name !== f.name || copy.emblem !== f.emblem) {
      problems.push(`${f.id} は 名前「${copy.name}」・紋章 ${copy.emblem}`)
    }
  }
  for (const copy of MAP_FACTION_LIST) if (!factions.some((f) => f.id === copy.id)) problems.push(`${copy.name}（${copy.id}）が余分`)
  if (!problems.length && MAP_FACTION_LIST.some((copy, i) => factions[i]?.id !== copy.id)) problems.push('並び順が違う')
  return problems
}

function Emblem({ emblem, size }: { emblem: number; size: number }) {
  const url = emblemImage(emblem)
  return url
    ? <img className="faction-emblem" src={url} alt="" width={size} height={size} />
    : <span className="faction-emblem faction-emblem--missing" style={{ width: size, height: size }}>?</span>
}

/** 勢力データ（ルートの src/data/factionData.json）を直接読み書きする。左に一覧、右に入力 */
export function FactionEditor({ active }: { active: boolean }) {
  const [factions, setFactions] = useState<Faction[] | null>(null)
  const [savedJson, setSavedJson] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [newId, setNewId] = useState('')
  const [status, setStatus] = useState<{ message?: string; error?: string }>({})
  /** 保存済みの拠点データと騎士データ（所属の表示と、削除できるかに使う）。タブを開くたびに読み直す */
  const [cities, setCities] = useState<City[]>([])
  const [characters, setCharacters] = useState<SourceCharacter[]>([])
  /** 保存済みの遺物データ（初期配布の候補）。タブを開くたびに読み直す */
  const [relics, setRelics] = useState<SourceRelic[]>([])
  const [newRelic, setNewRelic] = useState('')

  const load = useCallback(() => api<Faction[]>('/api/factions').then(
    (list) => {
      setFactions(list)
      setSavedJson(JSON.stringify(list))
      setSelectedId((id) => (list.some((f) => f.id === id) ? id : list[0]?.id ?? ''))
      setStatus({})
    },
    (e) => setStatus({ error: errorMessage(e) }),
  ), [])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!active) return
    api<City[]>('/api/cities').then(setCities, (e) => setStatus({ error: errorMessage(e) }))
    api<SourceCharacter[]>('/api/characters').then(setCharacters, (e) => setStatus({ error: errorMessage(e) }))
    api<SourceRelic[]>('/api/relics').then(setRelics, (e) => setStatus({ error: errorMessage(e) }))
  }, [active])

  const dirty = factions !== null && JSON.stringify(factions) !== savedJson
  useLeaveGuard(dirty)

  const save = async () => {
    if (!factions) return
    try {
      await api('/api/factions', { method: 'PUT', body: factions })
      setSavedJson(JSON.stringify(factions))
      setStatus({ message: `保存しました（${new Date().toLocaleTimeString()}）` })
    } catch (e) {
      setStatus({ error: errorMessage(e) })
    }
  }

  const faction = factions?.find((f) => f.id === selectedId)
  const index = factions?.findIndex((f) => f.id === selectedId) ?? -1
  const update = (patch: Partial<Faction>) =>
    setFactions((list) => list && list.map((f) => (f.id === selectedId ? { ...f, ...patch } : f)))

  /** 手番の順（一覧の順）で 1 つ前か後ろへ */
  const move = (by: -1 | 1) => setFactions((list) => {
    if (!list) return list
    const to = index + by
    if (index < 0 || to < 0 || to >= list.length) return list
    const next = [...list]
    ;[next[index], next[to]] = [next[to], next[index]]
    return next
  })

  const idProblem = (() => {
    if (!newId) return null
    if (!isFactionId(newId)) return 'ID は英小文字で始め、英小文字・数字・_ にしてください（mercenary は使えません）'
    if (factions?.some((f) => f.id === newId)) return 'その ID はもうあります'
    return null
  })()

  const add = () => {
    if (!newId || idProblem) return
    setFactions((list) => list && [...list, createFaction(newId)])
    setSelectedId(newId)
    setNewId('')
  }

  const citiesOf = (id: string) => cities.filter((c) => c.belongTo === id)
  const cityOwner = (cityId: string) => cities.find((c) => c.id === cityId)?.belongTo
  const knightsOf = (id: string) => characters.filter((c) => characterFaction(c, cityOwner) === id)

  /** 拠点や騎士が所属している勢力は削除しない（先に拠点データ・騎士データで所属を変える） */
  const remove = () => {
    if (!factions || !faction) return
    const owned = citiesOf(faction.id).length
    const knights = characters.filter((c) => c.start?.factionId === faction.id).length
    if (owned || knights) {
      alert(`${faction.name}には${[owned && `拠点 ${owned}`, knights && `騎士 ${knights}人`].filter(Boolean).join('・')}が所属しているので削除できません。\n先に拠点データ・騎士データで所属を変えて保存してください`)
      return
    }
    if (!confirm(`${faction.name}（${faction.id}）を削除しますか？`)) return
    const rest = factions.filter((f) => f.id !== faction.id)
    setFactions(rest)
    setSelectedId(rest[0]?.id ?? '')
  }

  if (!factions) return <div className="loading">{status.error ?? '読み込み中…'}</div>

  const problems = mapCopyProblems(factions)
  const owned = faction ? citiesOf(faction.id) : []
  const knights = faction ? knightsOf(faction.id) : []
  const sameEmblem = faction ? factions.filter((f) => f.id !== faction.id && f.emblem === faction.emblem) : []
  const startRelics = faction?.relics ?? []
  // 壊れた状態の無い遺物（魔導書）は、修復済みでだけ配れる
  const brokenRelics = relics.filter((r) => r.brokenName !== undefined)
  const relicLabel = ({ relicId, repaired }: FactionRelic) => {
    const relic = relics.find((r) => r.id === relicId)
    return repaired ? relic && `${relic.name}（修復済み）` : relic?.brokenName
  }
  /** 外すと relics を省く（空の配列を書かない） */
  const setStartRelics = (list: readonly FactionRelic[]) => update({ relics: list.length > 0 ? list : undefined })
  /** 足す遺物の選択肢の値は「状態:ID」 */
  const addStartRelic = () => {
    const [state, relicId] = newRelic.split(':')
    setStartRelics([...startRelics, { relicId, repaired: state === 'repaired' }])
  }

  return (
    <div className="character-editor">
      <aside className="character-list panel">
        <div className="toolbar">
          <input className="toolbar__search" value={newId} placeholder="新しい勢力の ID（例: orden）"
            onChange={(e) => setNewId(e.target.value.trim())} onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
          <button type="button" className="button" disabled={!newId || !!idProblem} onClick={add}>追加</button>
        </div>
        {idProblem && <span className="save-status save-status--error">{idProblem}</span>}
        <ul className="character-list__items">
          {factions.map((f) => (
            <li key={f.id}>
              <button type="button" className={`character-list__item ${f.id === selectedId ? 'is-selected' : ''}`}
                onClick={() => setSelectedId(f.id)}>
                <Emblem emblem={f.emblem} size={32} />
                <span className="character-list__text">
                  <span className="character-list__name">
                    <span className="swatch" style={{ background: f.color }} />{f.name}
                  </span>
                  <span className="character-list__sub">
                    {f.id} / {f.patriarchLabel} / 金 {(f.gold ?? INITIAL_GOLD).toLocaleString()} / 拠点 {citiesOf(f.id).length}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="form__hint">一覧の順が手番の順（プレイヤーの勢力が先）</p>
      </aside>

      <section className="character-main">
        <div className="toolbar panel">
          <button type="button" className="button button--primary" disabled={!dirty} onClick={save}>保存</button>
          <button type="button" className="button" disabled={!dirty}
            onClick={() => { if (confirm('保存していない変更を捨てて読み込み直しますか？')) load() }}>元に戻す</button>
          <SaveStatus dirty={dirty} {...status} />
        </div>

        {problems.length > 0 && (
          <div className="notice notice--warn">
            地図の勢力（norden-strategy の src/data/faction.ts）と違います。地図の紋章はそちらを使うので、ID・名前・紋章・並び順を揃えてください（ゲームのテストで比べる）
            <ul className="notice__files">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        )}

        {faction && (
          <div className="panel form">
            <h2 className="form__title">
              <span className="swatch swatch--large" style={{ background: faction.color }} />
              {faction.name}<span className="form__id">{faction.id}</span>
              <span className="form__actions">
                <button type="button" className="button" disabled={index <= 0} title="手番を 1 つ前へ" onClick={() => move(-1)}>↑</button>
                <button type="button" className="button" disabled={index >= factions.length - 1} title="手番を 1 つ後ろへ" onClick={() => move(1)}>↓</button>
                <button type="button" className="button button--danger" onClick={remove}>削除</button>
              </span>
            </h2>

            <div className="form__grid">
              <Field label="名前"><input value={faction.name} onChange={(e) => update({ name: e.target.value })} /></Field>
              <Field label="当主の呼び名">
                <input value={faction.patriarchLabel} placeholder="当主" onChange={(e) => update({ patriarchLabel: e.target.value })} />
              </Field>
              <Field label="色（地図の軍団など）">
                <span className="color-field">
                  <input type="color" value={faction.color} onChange={(e) => update({ color: e.target.value })} />
                  <input value={faction.color} onChange={(e) => update({ color: e.target.value })} />
                </span>
              </Field>
            </div>

            <h3 className="form__heading">紋章</h3>
            <ul className="emblem-picker">
              {EMBLEM_NUMBERS.map((n) => {
                const users = factions.filter((f) => f.id !== faction.id && f.emblem === n)
                return (
                  <li key={n}>
                    <button type="button" className={`emblem-picker__item ${n === faction.emblem ? 'is-selected' : ''} ${users.length ? 'is-used' : ''}`}
                      title={users.length ? `${n}（${users.map((f) => f.name).join('・')}）` : String(n)}
                      onClick={() => update({ emblem: n })}>
                      <Emblem emblem={n} size={48} />
                      <span className="emblem-picker__number">{n}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
            {sameEmblem.length > 0 && (
              <span className="save-status save-status--error">{sameEmblem.map((f) => f.name).join('・')}と同じ紋章です</span>
            )}

            <h3 className="form__heading">初期の状態</h3>
            <OptionalNumberField label="金" value={faction.gold} max={10000} step={50}
              fallback={INITIAL_GOLD} fallbackNote={String(INITIAL_GOLD)}
              onChange={(gold) => update({ gold })} />

            <h3 className="form__heading">初期配布の遺物（{startRelics.length}）</h3>
            {startRelics.length > 0 && (
              <ul className="chips">
                {startRelics.map((relic, i) => (
                  <li key={`${relic.relicId}-${i}`}>
                    <span className={`chip chip--static ${relicLabel(relic) ? '' : 'chip--missing'}`}>
                      {relicLabel(relic) ?? `${relic.relicId}（${relic.repaired ? '' : '壊れた'}遺物ではありません）`}
                      <button type="button" className="tags__remove" aria-label={`${relic.relicId}を外す`}
                        onClick={() => setStartRelics(startRelics.filter((_, j) => j !== i))}>×</button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="relation">
              <select value={newRelic} onChange={(e) => setNewRelic(e.target.value)}>
                <option value="">足す遺物を選ぶ</option>
                <optgroup label="壊れた遺物">
                  {brokenRelics.map((r) => <option key={r.id} value={`broken:${r.id}`}>{r.brokenName}</option>)}
                </optgroup>
                <optgroup label="修復済みの遺物">
                  {relics.map((r) => <option key={r.id} value={`repaired:${r.id}`}>{r.name}</option>)}
                </optgroup>
              </select>
              <button type="button" className="button" disabled={!newRelic} onClick={addStartRelic}>追加</button>
            </div>
            <p className="form__hint">選んだ状態でアイテムボックスに入る。同じ遺物を複数持てる</p>

            <h3 className="form__heading">初期の拠点（{owned.length}・人口 {owned.reduce((sum, c) => sum + c.population, 0).toLocaleString()}）</h3>
            {owned.length > 0
              ? <ul className="chips">{owned.map((c) => <li key={c.id}><span className="chip chip--static">{c.name}</span></li>)}</ul>
              : <p className="form__hint">なし（拠点データの「所属（初期）」で決める）</p>}

            <h3 className="form__heading">所属する騎士（{knights.length}人）</h3>
            {knights.length > 0 && (
              <ul className="chips">
                {knights.map((c) => (
                  <li key={c.id}>
                    <span className="chip chip--static">
                      {c.name}
                      {c.start?.isLord && <span className="chip__note">領主</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
