import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** norden-data のリポジトリ直下 */
export const DATA_DIR = path.resolve(fileURLToPath(new URL('..', import.meta.url)))

/** ゲーム本体（nordencult）のリポジトリ直下。既定は親ディレクトリ（サブモジュールとして置いたとき）。NORDEN_ROOT で変えられる */
export const GAME_ROOT = path.resolve(process.env.NORDEN_ROOT ?? path.join(DATA_DIR, '..'))

/** 騎士データの元データと元画像 */
export const CHARACTERS_FILE = path.join(DATA_DIR, 'characters', 'characters.json')
export const SHEETS_DIR = path.join(DATA_DIR, 'characters', 'sheets')

/** ゲームが読む出力先 */
export const OUTPUT = {
  /** 拠点データ（エディタで直接読み書きする） */
  cities: path.join(GAME_ROOT, 'src', 'data', 'cityData.json'),
  characterData: path.join(GAME_ROOT, 'src', 'data', 'characterData.json'),
  characterStart: path.join(GAME_ROOT, 'src', 'data', 'characterStart.json'),
  /** character.webp の大きさとセルの大きさ */
  characterSprite: path.join(GAME_ROOT, 'src', 'data', 'characterSprite.json'),
  characterImage: path.join(GAME_ROOT, 'src', 'assets', 'character.webp'),
} as const
