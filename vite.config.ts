import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { dataPlugin } from './server/dataPlugin.ts'
import { GAME_ROOT } from './server/paths.ts'

const local = (path: string) => fileURLToPath(new URL(path, import.meta.url))

// 街道・紋章（norden-strategy）と勢力・拠点などのデータ（ルートの src/data/）はゲーム本体のソースをそのまま読む。
// 戦闘のルールの口（norden-battle の battle-runtime/rules。遺物の魔法の ID）も、ゲーム本体と同じく three.js なしで読む
export default defineConfig({
  plugins: [react(), dataPlugin()],
  resolve: {
    alias: [
      { find: /^norden-strategy\/data$/, replacement: `${GAME_ROOT}/norden-strategy/src/data.ts` },
      { find: /^@game\/(.+)$/, replacement: `${GAME_ROOT}/src/$1` },
      { find: /^@norden\/battle-runtime\/rules$/, replacement: `${GAME_ROOT}/norden-battle/battle-runtime/src/rules.ts` },
      { find: /^@norden\/map-runtime\/(.+)$/, replacement: `${GAME_ROOT}/norden-battle/map-runtime/src/$1.ts` },
    ],
  },
  server: {
    port: 5180,
    fs: { allow: [local('.'), GAME_ROOT] },
  },
})
