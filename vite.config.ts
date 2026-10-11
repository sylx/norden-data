import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { dataPlugin } from './server/dataPlugin.ts'
import { GAME_ROOT } from './server/paths.ts'

const local = (path: string) => fileURLToPath(new URL(path, import.meta.url))

// 街道・勢力（norden-strategy）と勢力の色（ルートの src/data/factionColors.ts）はゲーム本体のソースをそのまま読む
export default defineConfig({
  plugins: [react(), dataPlugin()],
  resolve: {
    alias: [
      { find: /^norden-strategy\/data$/, replacement: `${GAME_ROOT}/norden-strategy/src/data.ts` },
      { find: /^@game\/(.+)$/, replacement: `${GAME_ROOT}/src/$1` },
    ],
  },
  server: {
    port: 5180,
    fs: { allow: [local('.'), GAME_ROOT] },
  },
})
