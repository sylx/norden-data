import { useEffect, useState } from 'react'
import { BuildingEditor } from './buildings/BuildingEditor'
import { CharacterEditor } from './characters/CharacterEditor'
import { CityEditor } from './cities/CityEditor'
import { FactionEditor } from './factions/FactionEditor'
import { VoiceLineEditor } from './voiceLines/VoiceLineEditor'

const TABS = [
  { id: 'cities', label: '拠点データ' },
  { id: 'factions', label: '勢力データ' },
  { id: 'characters', label: '騎士データ' },
  { id: 'buildings', label: '施設データ' },
  { id: 'voiceLines', label: 'セリフ' },
] as const
type TabId = (typeof TABS)[number]['id']

const tabFromHash = (): TabId => TABS.find((t) => `#${t.id}` === location.hash)?.id ?? 'cities'

/** 拠点データ・勢力データ・騎士データ・施設データ・セリフのエディタ。タブを切り替えても編集中の内容は残す */
export function App() {
  const [tab, setTab] = useState<TabId>(tabFromHash)

  useEffect(() => {
    const onHashChange = () => setTab(tabFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">norden-data</h1>
        <nav className="app__tabs">
          {TABS.map((t) => (
            <a key={t.id} href={`#${t.id}`} className={`app__tab ${tab === t.id ? 'is-active' : ''}`}>{t.label}</a>
          ))}
        </nav>
      </header>
      <main className="app__main">
        <div className="app__page" hidden={tab !== 'cities'}><CityEditor active={tab === 'cities'} /></div>
        <div className="app__page" hidden={tab !== 'factions'}><FactionEditor active={tab === 'factions'} /></div>
        <div className="app__page" hidden={tab !== 'characters'}><CharacterEditor /></div>
        <div className="app__page" hidden={tab !== 'buildings'}><BuildingEditor /></div>
        <div className="app__page" hidden={tab !== 'voiceLines'}><VoiceLineEditor active={tab === 'voiceLines'} /></div>
      </main>
    </div>
  )
}
