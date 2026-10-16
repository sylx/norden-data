import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BUILDING_EFFECT_LABELS, describeEffect, type Building, type BuildingEffect, type BuildingEffectKind, type CityTier,
} from '@game/data/buildings.ts'
import { api, errorMessage } from '../api'
import { Field, NumberField, SaveStatus, TagsField } from '../fields'
import { useLeaveGuard } from '../useDirty'
import { CropPreview, SquareCropEditor } from './SquareCropEditor'
import { defaultCrop, type BuildingImageSettings, type BuildingSource } from './types'

const EFFECT_KINDS = Object.keys(BUILDING_EFFECT_LABELS) as BuildingEffectKind[]
const TIERS: readonly CityTier[] = [1, 2, 3]
const TIER_LABELS: Readonly<Record<CityTier, string>> = { 1: 'Tier 1（どこでも）', 2: 'Tier 2 以上', 3: 'Tier 3 以上' }

const effectOf = (kind: BuildingEffectKind, value = 10): BuildingEffect =>
  kind === 'mercenary' ? { kind } : { kind, value }

const newBuilding = (id: string): Building => ({
  id, name: id, description: '', supplies: 300, gold: 100, minTier: 1, effects: [],
})

/** GET /api/building-images */
interface ImageData {
  sources: BuildingSource[]
  settings: BuildingImageSettings
}

/**
 * 施設データ（ルートの src/data/buildingData.json）を直接読み書きする。左に一覧、右に画像と入力。
 * 画像は buildings/sources/ の元画像から正方形を切り抜き、ゲームの src/assets/buildings/<id>.webp に書き出す
 */
export function BuildingEditor() {
  const [buildings, setBuildings] = useState<Building[] | null>(null)
  const [settings, setSettings] = useState<BuildingImageSettings>({})
  const [sources, setSources] = useState<BuildingSource[]>([])
  const [savedJson, setSavedJson] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [newId, setNewId] = useState('')
  const [status, setStatus] = useState<{ message?: string; error?: string }>({})
  const [busy, setBusy] = useState(false)
  /** 書き出した画像を読み直させる */
  const [imageVersion, setImageVersion] = useState(() => Date.now())

  const snapshot = (list: Building[] | null, images: BuildingImageSettings) => JSON.stringify([list, images])

  const loadSources = useCallback(() => api<ImageData>('/api/building-images').then(
    (data) => setSources(data.sources),
    (e) => setStatus({ error: errorMessage(e) }),
  ), [])

  const load = useCallback(() => Promise.all([api<Building[]>('/api/buildings'), api<ImageData>('/api/building-images')]).then(
    ([list, images]) => {
      setBuildings(list)
      setSettings(images.settings)
      setSources(images.sources)
      setSavedJson(snapshot(list, images.settings))
      setSelectedId((id) => (list.some((b) => b.id === id) ? id : list[0]?.id ?? ''))
      setStatus({})
    },
    (e) => setStatus({ error: errorMessage(e) }),
  ), [])
  useEffect(() => { load() }, [load])

  const dirty = buildings !== null && snapshot(buildings, settings) !== savedJson
  useLeaveGuard(dirty)

  const save = async (list = buildings, images = settings) => {
    if (!list) return false
    try {
      await api('/api/buildings', { method: 'PUT', body: list })
      await api('/api/building-images', { method: 'PUT', body: images })
      setSavedJson(snapshot(list, images))
      setStatus({ message: `保存しました（${new Date().toLocaleTimeString()}）` })
      return true
    } catch (e) {
      setStatus({ error: errorMessage(e) })
      return false
    }
  }

  const building = buildings?.find((b) => b.id === selectedId)
  const update = (patch: Partial<Building>) =>
    setBuildings((list) => list && list.map((b) => (b.id === selectedId ? { ...b, ...patch } : b)))
  const setEffects = (effects: BuildingEffect[]) => update({ effects })

  const setting = building ? settings[building.id] : undefined
  const source = useMemo(() => sources.find((s) => s.file === setting?.file), [sources, setting])
  const setSetting = (next: BuildingImageSettings[string] | undefined) => {
    if (!building) return
    setSettings((all) => {
      const { [building.id]: _, ...rest } = all
      return next ? { ...rest, [building.id]: next } : rest
    })
  }

  const idProblem = (() => {
    if (!newId) return null
    if (!/^[a-z][a-z0-9_]*$/.test(newId)) return 'ID は英小文字で始め、英小文字・数字・_ にしてください'
    if (buildings?.some((b) => b.id === newId)) return 'その ID はもうあります'
    return null
  })()

  const add = () => {
    if (!newId || idProblem) return
    setBuildings((list) => list && [...list, newBuilding(newId)])
    setSelectedId(newId)
    setNewId('')
  }

  const remove = () => {
    if (!building || !confirm(`${building.name}（${building.id}）を削除しますか？ 拠点の初期の施設に入っていれば、そこにも残ります`)) return
    setBuildings((list) => list && list.filter((b) => b.id !== building.id))
    setSetting(undefined)
    setSelectedId(buildings?.find((b) => b.id !== building.id)?.id ?? '')
  }

  /** 保存してから画像を書き出し、施設の image を <id>.webp にする */
  const exportImage = async () => {
    if (!building || !buildings) return
    setBusy(true)
    const list = buildings.map((b) => (b.id === building.id ? { ...b, image: `${b.id}.webp` } : b))
    setBuildings(list)
    try {
      if (!await save(list)) return
      const result = await api<{ file: string; bytes: number }>('/api/building-images/export', { method: 'POST', body: { id: building.id } })
      setImageVersion(Date.now())
      setStatus({ message: `書き出しました: ${result.file}（${(result.bytes / 1024).toFixed(0)} KB）` })
    } catch (e) {
      setStatus({ error: errorMessage(e) })
    } finally {
      setBusy(false)
    }
  }

  if (!buildings) return <div className="loading">{status.error ?? '読み込み中…'}</div>

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
                {b.image
                  ? <img className="building-list__image" src={`/building-images/${b.image}?v=${imageVersion}`} alt="" />
                  : <span className="building-list__image sheet-crop--empty">?</span>}
                <span className="character-list__text">
                  <span className="character-list__name">{b.name}</span>
                  <span className="character-list__sub">{b.id} / Tier {b.minTier} / {b.effects.map(describeEffect).join('・') || '効果なし'}</span>
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
          <button type="button" className="button" onClick={loadSources}>元画像を読み直す</button>
          <SaveStatus dirty={dirty} {...status} />
        </div>

        {building && (
          <div className="character-form">
            <div className="character-form__images panel">
              <h3 className="form__heading">画像</h3>
              <Field label="元画像（norden-data/buildings/sources/）">
                <select value={setting?.file ?? ''} onChange={(e) => {
                  const next = sources.find((s) => s.file === e.target.value)
                  setSetting(next && { file: next.file, crop: defaultCrop(next) })
                }}>
                  <option value="">なし</option>
                  {setting && !source && <option value={setting.file}>{setting.file}（見つかりません）</option>}
                  {sources.map((s) => <option key={s.file} value={s.file}>{s.file}（{s.width}×{s.height}）</option>)}
                </select>
              </Field>
              {sources.length === 0 && <p className="form__hint">元画像を buildings/sources/ に置いて「元画像を読み直す」を押してください</p>}
              {source && setting && (
                <>
                  <SquareCropEditor source={source} crop={setting.crop} onChange={(crop) => setSetting({ ...setting, crop })} />
                  <div className="building-previews">
                    <CropPreview source={source} crop={setting.crop} width={128} className="building-preview" />
                    <CropPreview source={source} crop={setting.crop} width={64} className="building-preview" />
                  </div>
                  <button type="button" className="button button--accent" disabled={busy} onClick={exportImage}
                    title={`保存してから、ゲームの src/assets/buildings/${building.id}.webp に書き出す`}>画像を書き出す</button>
                </>
              )}
              <h3 className="form__heading">ゲームの画像</h3>
              {building.image ? (
                <div className="building-previews">
                  <img className="building-preview" src={`/building-images/${building.image}?v=${imageVersion}`} width={128} height={128} alt="" />
                  <div className="form">
                    <span className="form__hint">src/assets/buildings/{building.image}</span>
                    <button type="button" className="button" onClick={() => update({ image: undefined })}
                      title="施設データから画像を外す（ファイルは残る）">画像を外す</button>
                  </div>
                </div>
              ) : <p className="form__hint">未設定</p>}
            </div>

            <div className="character-form__data panel form">
              <h2 className="form__title">
                {building.name}<span className="form__id">{building.id}</span>
                <button type="button" className="button button--danger form__delete" onClick={remove}>削除</button>
              </h2>

              <div className="form__grid">
                <Field label="名前"><input value={building.name} onChange={(e) => update({ name: e.target.value })} /></Field>
                <Field label="建てられる都市">
                  <select value={building.minTier} onChange={(e) => update({ minTier: Number(e.target.value) as CityTier })}>
                    {TIERS.map((t) => <option key={t} value={t}>{TIER_LABELS[t]}</option>)}
                  </select>
                </Field>
                <Field label="必要なタグ（どれか）" wide>
                  <TagsField value={building.requiredTags ?? []}
                    onChange={(tags) => update({ requiredTags: tags.length ? tags : undefined })} />
                </Field>
                <Field label="説明" wide>
                  <textarea rows={3} value={building.description} onChange={(e) => update({ description: e.target.value })} />
                </Field>
              </div>

              <h3 className="form__heading">費用</h3>
              <NumberField label="物資" value={building.supplies} max={3000} step={10} onChange={(supplies) => update({ supplies })} />
              <NumberField label="金" value={building.gold} max={1000} step={10} onChange={(gold) => update({ gold })} />

              <h3 className="form__heading">効果</h3>
              {building.effects.map((effect, i) => (
                <div key={i} className="relation">
                  <select value={effect.kind} onChange={(e) => setEffects(building.effects.map((ef, j) => (
                    j === i ? effectOf(e.target.value as BuildingEffectKind, 'value' in ef ? ef.value : undefined) : ef)))}>
                    {EFFECT_KINDS.map((k) => <option key={k} value={k}>{BUILDING_EFFECT_LABELS[k]}</option>)}
                  </select>
                  {'value' in effect && (
                    <input type="number" className="number-field__input building-effect__value" value={effect.value} step={5}
                      onChange={(e) => setEffects(building.effects.map((ef, j) => (
                        j === i ? { ...effect, value: e.target.value === '' ? 0 : Number(e.target.value) } : ef)))} />
                  )}
                  <span className="relation__target form__hint">{describeEffect(effect)}</span>
                  <button type="button" className="button" aria-label="効果を外す"
                    onClick={() => setEffects(building.effects.filter((_, j) => j !== i))}>×</button>
                </div>
              ))}
              <button type="button" className="button" onClick={() => setEffects([...building.effects, effectOf('marketPct')])}>
                ＋ 効果を追加
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
