import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** norden-data のリポジトリ直下 */
export const DATA_DIR = path.resolve(fileURLToPath(new URL('..', import.meta.url)))

/** ゲーム本体（nordencult）のリポジトリ直下。既定は親ディレクトリ（サブモジュールとして置いたとき）。NORDEN_ROOT で変えられる */
export const GAME_ROOT = path.resolve(process.env.NORDEN_ROOT ?? path.join(DATA_DIR, '..'))

/** 騎士データの元データと元画像 */
export const CHARACTERS_FILE = path.join(DATA_DIR, 'characters', 'characters.json')
export const SHEETS_DIR = path.join(DATA_DIR, 'characters', 'sheets')

/** 施設データの元データと元画像（横 5 × 縦 4 に並べた 1 枚、セルはキャラクターと同じ） */
export const BUILDINGS_FILE = path.join(DATA_DIR, 'buildings', 'buildings.json')
export const BUILDING_SHEETS_DIR = path.join(DATA_DIR, 'buildings', 'sources')

/** ゲームが読む出力先 */
export const OUTPUT = {
  /** 拠点データ（エディタで直接読み書きする） */
  cities: path.join(GAME_ROOT, 'src', 'data', 'cityData.json'),
  /** 勢力データ（エディタで直接読み書きする） */
  factions: path.join(GAME_ROOT, 'src', 'data', 'factionData.json'),
  buildingData: path.join(GAME_ROOT, 'src', 'data', 'buildingData.json'),
  /** buildings.webp の大きさとセルの大きさ */
  buildingSprite: path.join(GAME_ROOT, 'src', 'data', 'buildingSprite.json'),
  buildingImage: path.join(GAME_ROOT, 'src', 'assets', 'buildings.webp'),
  /** セリフ（エディタで直接読み書きする） */
  voiceLines: path.join(GAME_ROOT, 'src', 'data', 'voiceLines.json'),
  characterData: path.join(GAME_ROOT, 'src', 'data', 'characterData.json'),
  characterStart: path.join(GAME_ROOT, 'src', 'data', 'characterStart.json'),
  /** character-<n>.webp の各大きさとセルの大きさ */
  characterSprite: path.join(GAME_ROOT, 'src', 'data', 'characterSprite.json'),
  /** character-0.webp, character-1.webp, … を置く場所 */
  characterImageDir: path.join(GAME_ROOT, 'src', 'assets'),
} as const
