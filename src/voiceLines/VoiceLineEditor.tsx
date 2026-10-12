import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  PERSONALITY_AXES, PERSONALITY_LABELS, VOICE_TONE_GROUPS, VOICE_TONE_IDS, VOICE_TONE_LABELS,
} from '@game/data/characterVoice.ts'
import {
  ANY, CELL_ORDER, cellKey, voiceLineCells,
  type CellKey, type PersonalityKey, type ToneKey, type VoiceLineData, type VoiceSituation,
} from '@game/data/voiceLines.ts'
import { api, errorMessage } from '../api'
import type { SourceCharacter } from '../characters/types'
import { Field, SaveStatus } from '../fields'
import { useLeaveGuard } from '../useDirty'

/** 見出しの短い名前（「（」より前） */
const short = (label: string) => label.split('（')[0]
const toneName = (tone: ToneKey) => (tone === ANY ? '共通' : short(VOICE_TONE_LABELS[tone]))
const personalityName = (p: PersonalityKey) => (p === ANY ? '性格を問わない' : short(PERSONALITY_LABELS[p]))

const TONE_COLUMNS: readonly ToneKey[] = [ANY, ...VOICE_TONE_IDS]

/** 場面の順はそのまま、セルは CELL_ORDER の順（知らないセルは後ろ）にそろえ、空のセルを除く */
function normalize(data: VoiceLineData): VoiceLineData {
  const rank = (key: string) => {
    const i = CELL_ORDER.indexOf(key as CellKey)
    return i < 0 ? CELL_ORDER.length : i
  }
  const lines: VoiceLineData['lines'] = {}
  for (const { id } of data.situations) {
    const cells = Object.entries(data.lines[id] ?? {})
      .filter(([, list]) => list?.length)
      .sort(([a], [b]) => rank(a) - rank(b))
    if (cells.length) lines[id] = Object.fromEntries(cells)
  }
  return { situations: data.situations, lines }
}

/** 1 行に 1 つ。前後の空白と空行は除く */
const parseLines = (text: string) => text.split('\n').map((t) => t.trim()).filter(Boolean)

/** セルに当たる騎士（口調が合う（共通の列は口調が未設定）、性格が合う（性格が共通の行は問わない）） */
const matches = (c: SourceCharacter, tone: ToneKey, p: PersonalityKey) =>
  (tone === ANY ? !c.voiceTone : c.voiceTone === tone) && (p === ANY || !!c.personality?.includes(p))

/**
 * セリフ（ルートの src/data/voiceLines.json）を直接読み書きする。
 * 左で場面を選び、真ん中の口調 × 性格のマトリックスでセルを選び、右でセルのセリフを書く
 */
export function VoiceLineEditor({ active }: { active: boolean }) {
  const [data, setData] = useState<VoiceLineData | null>(null)
  const [savedJson, setSavedJson] = useState('')
  /** 読み直すたびに進める（セリフの入力欄を作り直す） */
  const [version, setVersion] = useState(0)
  const [status, setStatus] = useState<{ message?: string; error?: string }>({})
  const [situationId, setSituationId] = useState('')
  const [tone, setTone] = useState<ToneKey>(ANY)
  const [personality, setPersonality] = useState<PersonalityKey>(ANY)
  /** 保存済みの騎士データ（セルに当たる騎士とプレビューに使う）。タブを開くたびに読み直す */
  const [characters, setCharacters] = useState<SourceCharacter[]>([])
  const [previewId, setPreviewId] = useState('')

  const load = useCallback(() => api<VoiceLineData>('/api/voice-lines').then(
    (loaded) => {
      const normalized = normalize(loaded)
      setData(normalized)
      setSavedJson(JSON.stringify(normalized))
      setVersion((v) => v + 1)
      setSituationId((id) => (normalized.situations.some((s) => s.id === id) ? id : normalized.situations[0]?.id ?? ''))
      setStatus({})
    },
    (e) => setStatus({ error: errorMessage(e) }),
  ), [])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!active) return
    api<SourceCharacter[]>('/api/characters').then(setCharacters, (e) => setStatus({ error: errorMessage(e) }))
  }, [active])

  const normalizedJson = useMemo(() => (data ? JSON.stringify(normalize(data)) : ''), [data])
  const dirty = data !== null && normalizedJson !== savedJson
  useLeaveGuard(dirty)

  const save = async () => {
    if (!data) return
    const body = normalize(data)
    try {
      await api('/api/voice-lines', { method: 'PUT', body })
      setSavedJson(JSON.stringify(body))
      setStatus({ message: `保存しました（${new Date().toLocaleTimeString()}）` })
    } catch (e) {
      setStatus({ error: errorMessage(e) })
    }
  }

  if (!data) return <div className="loading">{status.error ?? '読み込み中…'}</div>

  const situation = data.situations.find((s) => s.id === situationId)
  const cells = data.lines[situationId] ?? {}
  const key = cellKey(tone, personality)
  const count = (t: ToneKey, p: PersonalityKey) => cells[cellKey(t, p)]?.length ?? 0
  /** 口調の列にセリフが 1 つも無い（その口調の騎士はこの場面で何も言わない） */
  const columnEmpty = (t: ToneKey) => ([ANY, ...PERSONALITY_AXES.flatMap((a) => a.tags)] as PersonalityKey[]).every((p) => !count(t, p))

  const setCell = (list: string[]) => setData((d) => d && {
    ...d,
    lines: { ...d.lines, [situationId]: { ...d.lines[situationId], [key]: list } },
  })

  const updateSituation = (patch: Partial<VoiceSituation>) => setData((d) => d && {
    ...d,
    situations: d.situations.map((s) => (s.id === situationId ? { ...s, ...patch } : s)),
  })

  const renameSituation = (id: string) => {
    id = id.trim()
    if (!id || id === situationId) return
    if (data.situations.some((s) => s.id === id)) {
      setStatus({ error: `場面の ID が重複しています: ${id}` })
      return
    }
    setData((d) => {
      if (!d) return d
      const { [situationId]: moved, ...rest } = d.lines
      return {
        situations: d.situations.map((s) => (s.id === situationId ? { ...s, id } : s)),
        lines: moved ? { ...rest, [id]: moved } : rest,
      }
    })
    setSituationId(id)
    setStatus({})
  }

  const addSituation = () => {
    const id = prompt('場面の ID（ゲームのコードが引く名前。例: strategy.march）')?.trim()
    if (!id) return
    if (data.situations.some((s) => s.id === id)) {
      setStatus({ error: `場面の ID が重複しています: ${id}` })
      return
    }
    const group = situation?.group ?? 'その他'
    setData((d) => d && { ...d, situations: [...d.situations, { id, group, label: id }] })
    setSituationId(id)
  }

  const removeSituation = () => {
    if (!situation || !confirm(`場面「${situation.label}」とそのセリフをすべて消しますか？`)) return
    setData((d) => d && {
      situations: d.situations.filter((s) => s.id !== situationId),
      lines: Object.fromEntries(Object.entries(d.lines).filter(([id]) => id !== situationId)),
    })
    setSituationId(data.situations.find((s) => s.id !== situationId)?.id ?? '')
  }

  const groups = [...new Set(data.situations.map((s) => s.group))]
  const total = (id: string) => Object.values(data.lines[id] ?? {}).reduce((n, list) => n + (list?.length ?? 0), 0)
  const coveredTones = (id: string) => VOICE_TONE_IDS.filter((t) =>
    Object.entries(data.lines[id] ?? {}).some(([k, list]) => k.startsWith(`${t}/`) && list?.length)).length

  const cellKnights = characters.filter((c) => matches(c, tone, personality))
  const preview = characters.find((c) => c.id === previewId)
  const previewCells = preview ? voiceLineCells(situationId, preview, data) : []

  /** マトリックスの 1 行（性格 p） */
  const matrixRow = (p: PersonalityKey) => (
    <tr key={p} className={p === personality ? 'is-active' : ''}>
      <th className="voice-matrix__personality" title={p === ANY ? undefined : PERSONALITY_LABELS[p]}>{personalityName(p)}</th>
      {TONE_COLUMNS.map((t) => {
        const n = count(t, p)
        const knights = characters.filter((c) => matches(c, t, p))
        return (
          <td key={t}>
            <button type="button"
              className={`voice-matrix__cell ${t === tone && p === personality ? 'is-selected' : ''}`}
              data-level={Math.min(n, 4)}
              title={`${toneName(t)} × ${personalityName(p)}: ${n} 件${knights.length ? `\n${knights.map((c) => c.name).join('、')}` : ''}`}
              onClick={() => { setTone(t); setPersonality(p) }}>
              {n || ''}
              {knights.length > 0 && <span className="voice-matrix__dot" />}
            </button>
          </td>
        )
      })}
    </tr>
  )

  return (
    <div className="voice-editor">
      <section className="voice-editor__situations panel">
        <div className="toolbar">
          <button type="button" className="button button--primary" disabled={!dirty} onClick={save}>保存</button>
          <button type="button" className="button" disabled={!dirty}
            onClick={() => { if (confirm('保存していない変更を捨てて読み込み直しますか？')) load() }}>元に戻す</button>
        </div>
        <SaveStatus dirty={dirty} {...status} />
        {groups.map((group) => (
          <div key={group}>
            <h3 className="form__heading">{group}</h3>
            <ul className="situation-list">
              {data.situations.filter((s) => s.group === group).map((s) => (
                <li key={s.id}>
                  <button type="button" className={`situation-list__item ${s.id === situationId ? 'is-selected' : ''}`}
                    onClick={() => setSituationId(s.id)}>
                    <span className="situation-list__label">{s.label}</span>
                    <span className="situation-list__sub">{total(s.id)} 件・口調 {coveredTones(s.id)}/{VOICE_TONE_IDS.length}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <button type="button" className="button" onClick={addSituation}>場面を追加</button>
      </section>

      <section className="voice-editor__matrix panel">
        {situation ? (
          <>
            <div className="form__grid voice-editor__situation">
              <Field label="名前"><input value={situation.label} onChange={(e) => updateSituation({ label: e.target.value })} /></Field>
              <Field label="グループ"><input value={situation.group} onChange={(e) => updateSituation({ group: e.target.value })} /></Field>
              <Field label="ID（ゲームのコードが引く。変えるとゲーム側も直す）">
                <input key={`${version}|${situationId}`} defaultValue={situation.id}
                  onBlur={(e) => renameSituation(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
              </Field>
              <Field label="いつ言うか">
                <input value={situation.note ?? ''} onChange={(e) => updateSituation({ note: e.target.value || undefined })} />
              </Field>
            </div>
            <button type="button" className="button button--danger voice-editor__remove" onClick={removeSituation}>この場面を消す</button>
            <div className="voice-matrix">
              <table>
                <thead>
                  <tr>
                    <th className="voice-matrix__corner" rowSpan={2}>性格 ＼ 口調</th>
                    <th className="voice-matrix__group">共通</th>
                    {VOICE_TONE_GROUPS.map((g) => <th key={g.label} className="voice-matrix__group" colSpan={g.ids.length}>{g.label}</th>)}
                  </tr>
                  <tr>
                    {TONE_COLUMNS.map((t) => (
                      <th key={t} className={`voice-matrix__tone ${t === tone ? 'is-active' : ''} ${t !== ANY && columnEmpty(t) ? 'is-fallback' : ''}`}
                        title={t === ANY ? '口調が未設定の騎士（と騎士のいない部隊）が言う' : VOICE_TONE_LABELS[t]}>
                        <span>{toneName(t)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrixRow(ANY)}
                  {PERSONALITY_AXES.map((axis) => [
                    <tr key={axis.label} className="voice-matrix__axis"><th colSpan={TONE_COLUMNS.length + 1}>{axis.label}</th></tr>,
                    ...axis.tags.map(matrixRow),
                  ])}
                </tbody>
              </table>
            </div>
            <p className="voice-editor__hint">
              数字はセルのセリフの数、点はそのセルに当たる騎士がいること。騎士は自分の口調の列（性格を問わない行と自分の性格の行）から引く。
              共通の列は口調が未設定の騎士が引く。口調の見出しが暗い列は、この場面にセリフが無い口調（その口調の騎士は何も言わない）。
            </p>
          </>
        ) : <p className="loading">場面を選んでください。</p>}
      </section>

      <section className="voice-editor__cell panel">
        {situation && (
          <div className="form">
            <h2 className="voice-editor__cell-title">
              {situation.label}
              <span className="form__id">{toneName(tone)} × {personalityName(personality)}</span>
            </h2>
            {situation.note && <p className="voice-editor__note">{situation.note}</p>}
            {tone !== ANY && <p className="voice-editor__note">口調: {VOICE_TONE_LABELS[tone]}</p>}
            {personality !== ANY && <p className="voice-editor__note">性格: {PERSONALITY_LABELS[personality]}</p>}

            <Field label={`セリフ（1 行に 1 つ。${count(tone, personality)} 件）`}>
              <LinesInput key={`${version}|${situationId}|${key}`} lines={cells[key] ?? []} onChange={setCell} />
            </Field>

            {personality !== ANY && (
              <>
                <h3 className="form__heading">同じ口調の「性格を問わない」セリフ（一緒に選ばれる）</h3>
                <LineList lines={cells[cellKey(tone, ANY)] ?? []} />
              </>
            )}

            <h3 className="form__heading">当たる騎士（{cellKnights.length}人）</h3>
            {cellKnights.length > 0 ? (
              <ul className="chips">
                {cellKnights.map((c) => (
                  <li key={c.id}>
                    <button type="button" className="chip" onClick={() => setPreviewId(c.id)}>{c.name}</button>
                  </li>
                ))}
              </ul>
            ) : <p className="voice-editor__note">いません。</p>}

            <h3 className="form__heading">プレビュー</h3>
            <select value={previewId} onChange={(e) => setPreviewId(e.target.value)}>
              <option value="">騎士を選ぶ</option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>{c.id} {c.name}{c.voiceTone ? '' : '（口調なし）'}</option>
              ))}
            </select>
            {preview && (
              <>
                <p className="voice-editor__note">
                  {preview.voiceTone ? toneName(preview.voiceTone) : '口調なし'}
                  {preview.personality?.length ? ` / ${preview.personality.map(personalityName).join('・')}` : ''}
                </p>
                {previewCells.length ? previewCells.map((k) => {
                  const [t, p] = k.split('/') as [ToneKey, PersonalityKey]
                  return (
                    <div key={k}>
                      <button type="button" className="voice-editor__from" onClick={() => { setTone(t); setPersonality(p) }}>
                        {toneName(t)} × {personalityName(p)}
                      </button>
                      <LineList lines={cells[k] ?? []} />
                    </div>
                  )
                }) : <p className="voice-editor__note">この場面で言うセリフがありません。</p>}
              </>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

/** セルのセリフの入力（1 行に 1 つ）。打ちかけの空行を消さないよう、入力中の文字は自分で持つ */
function LinesInput({ lines, onChange }: { lines: readonly string[]; onChange: (lines: string[]) => void }) {
  const [text, setText] = useState(() => lines.join('\n'))
  return (
    <textarea className="voice-editor__lines" rows={10} value={text} placeholder="このセルのセリフはありません"
      onChange={(e) => {
        setText(e.target.value)
        onChange(parseLines(e.target.value))
      }} />
  )
}

function LineList({ lines }: { lines: readonly string[] }) {
  if (!lines.length) return <p className="voice-editor__note">ありません。</p>
  return <ul className="voice-editor__line-list">{lines.map((t, i) => <li key={i}>{t}</li>)}</ul>
}
