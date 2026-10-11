import { useEffect, useState } from 'react'
import { CharacterEditor } from './characters/CharacterEditor'
import { CityEditor } from './cities/CityEditor'

const TABS = [
  { id: 'cities', label: '拠点データ' },
  { id: 'characters', label: '騎士データ' },
] as const
type TabId = (typeof TABS)[number]['id']

const tabFromHash = (): TabId => (location.hash === '#characters' ? 'characters' : 'cities')

/** 拠点データと騎士データのエディタ。タブを切り替えても編集中の内容は残す */
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
        <div className="app__page" hidden={tab !== 'cities'}><CityEditor /></div>
        <div className="app__page" hidden={tab !== 'characters'}><CharacterEditor /></div>
      </main>
    </div>
  )
}
