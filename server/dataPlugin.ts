/**
 * エディタの読み書きを受け持つ Vite プラグイン（開発サーバーだけ）。
 *
 * - GET/PUT  /api/cities             ルートの src/data/cityData.json
 * - GET/PUT  /api/factions           ルートの src/data/factionData.json
 * - GET/PUT  /api/buildings          buildings/buildings.json（施設データの元データ）
 * - POST     /api/buildings/export   ルートの buildingData.json・buildings.webp などに書き出す
 * - GET      /api/building-sheets    buildings/sources/ の元画像とセルの並び
 * - GET      /building-sheets/<file> 施設の元画像
 * - GET/PUT  /api/voice-lines        ルートの src/data/voiceLines.json
 * - GET/PUT  /api/characters         characters/characters.json（騎士データの元データ）
 * - POST     /api/characters/export  ルートの characterData.json などに書き出す
 * - POST     /api/characters/export-data  画像以外（characterData.json・characterStart.json）だけを書き出す
 * - GET      /api/sheets             characters/sheets/ の元画像とセルの並び
 * - GET      /sheets/<file>          元画像
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import type { Plugin } from 'vite'
import { isBuildingId, type SourceBuilding } from '../src/buildings/types.ts'
import type { SourceCharacter } from '../src/characters/types.ts'
import { isFactionId } from '../src/factions/types.ts'
import { exportBuildings } from './exportBuildings.ts'
import { exportCharacterData, exportCharacters } from './exportCharacters.ts'
import { ExportError } from './files.ts'
import { BUILDING_SHEETS_DIR, BUILDINGS_FILE, CHARACTERS_FILE, OUTPUT, SHEETS_DIR } from './paths.ts'
import { isSheetFileName, listSheets } from './sheets.ts'

class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const MIME: Record<string, string> = { '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' }

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')
  res.end(JSON.stringify(body))
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, 'JSON として読めません')
  }
}

/** id のある要素の配列であること（中身はエディタが作る） */
function assertList(body: unknown): asserts body is { id: string }[] {
  if (!Array.isArray(body) || !body.every((item) => item && typeof item.id === 'string')) {
    throw new HttpError(400, 'id のある要素の配列ではありません')
  }
  const ids = body.map((item) => item.id)
  const dup = ids.find((id, i) => ids.indexOf(id) !== i)
  if (dup) throw new HttpError(400, `id が重複しています: ${dup}`)
}

/** セリフのデータ（場面の配列と、場面ごとのセル → セリフの配列）であること */
function assertVoiceLines(body: unknown): asserts body is { situations: { id: string }[]; lines: Record<string, Record<string, string[]>> } {
  const data = body as { situations?: unknown; lines?: unknown }
  if (!data || typeof data !== 'object' || !data.lines || typeof data.lines !== 'object') {
    throw new HttpError(400, 'situations と lines のあるオブジェクトではありません')
  }
  assertList(data.situations)
  for (const [situation, cells] of Object.entries(data.lines)) {
    const ok = cells && typeof cells === 'object'
      && Object.values(cells).every((list) => Array.isArray(list) && list.every((t) => typeof t === 'string'))
    if (!ok) throw new HttpError(400, `${situation} のセルがセリフの配列ではありません`)
  }
}

/** 元画像を返す（ファイル名を検査してから） */
async function sendImage(res: ServerResponse, dir: string, file: string) {
  let data: Buffer
  try {
    data = await readFile(path.join(dir, file))
  } catch {
    throw new HttpError(404, `見つかりません: ${file}`)
  }
  res.statusCode = 200
  res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.end(data)
}

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch (e) {
    throw new HttpError(500, `${file} が読めません: ${e instanceof Error ? e.message : e}`)
  }
}

async function writeJson(file: string, body: unknown) {
  await mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  await writeFile(tmp, JSON.stringify(body, null, 2) + '\n')
  await rename(tmp, file)
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const route = `${req.method ?? 'GET'} ${decodeURIComponent(url.pathname)}`

  switch (route) {
    case 'GET /api/cities':
      sendJson(res, 200, await readJson(OUTPUT.cities))
      return true
    case 'PUT /api/cities': {
      const body = await readBody(req)
      assertList(body)
      await writeJson(OUTPUT.cities, body)
      sendJson(res, 200, { ok: true, file: OUTPUT.cities })
      return true
    }
    case 'GET /api/factions':
      sendJson(res, 200, await readJson(OUTPUT.factions))
      return true
    case 'PUT /api/factions': {
      const body = await readBody(req)
      assertList(body)
      const bad = body.find((f) => !isFactionId(f.id))
      if (bad) throw new HttpError(400, `勢力の ID は英小文字・数字・_ にしてください（mercenary は使えません）: ${bad.id}`)
      await writeJson(OUTPUT.factions, body)
      sendJson(res, 200, { ok: true, file: OUTPUT.factions })
      return true
    }
    case 'GET /api/buildings':
      sendJson(res, 200, await readJson(BUILDINGS_FILE))
      return true
    case 'PUT /api/buildings': {
      const body = await readBody(req)
      assertList(body)
      const bad = body.find((b) => !isBuildingId(b.id))
      if (bad) throw new HttpError(400, `施設の ID は英小文字・数字・_ にしてください: ${bad.id}`)
      await writeJson(BUILDINGS_FILE, body)
      sendJson(res, 200, { ok: true, file: BUILDINGS_FILE })
      return true
    }
    case 'POST /api/buildings/export': {
      const buildings = await readJson(BUILDINGS_FILE)
      assertList(buildings)
      try {
        sendJson(res, 200, await exportBuildings(buildings as SourceBuilding[]))
      } catch (e) {
        if (e instanceof ExportError) throw new HttpError(400, e.message)
        throw e
      }
      return true
    }
    case 'GET /api/building-sheets':
      sendJson(res, 200, await listSheets(BUILDING_SHEETS_DIR))
      return true
    case 'GET /api/voice-lines':
      sendJson(res, 200, await readJson(OUTPUT.voiceLines))
      return true
    case 'PUT /api/voice-lines': {
      const body = await readBody(req)
      assertVoiceLines(body)
      await writeJson(OUTPUT.voiceLines, body)
      sendJson(res, 200, { ok: true, file: OUTPUT.voiceLines })
      return true
    }
    case 'GET /api/characters':
      sendJson(res, 200, await readJson(CHARACTERS_FILE))
      return true
    case 'PUT /api/characters': {
      const body = await readBody(req)
      assertList(body)
      await writeJson(CHARACTERS_FILE, body)
      sendJson(res, 200, { ok: true, file: CHARACTERS_FILE })
      return true
    }
    case 'POST /api/characters/export':
    case 'POST /api/characters/export-data': {
      const characters = await readJson(CHARACTERS_FILE)
      assertList(characters)
      const exporter = route.endsWith('export-data') ? exportCharacterData : exportCharacters
      try {
        sendJson(res, 200, await exporter(characters as SourceCharacter[]))
      } catch (e) {
        if (e instanceof ExportError) throw new HttpError(400, e.message)
        throw e
      }
      return true
    }
    case 'GET /api/sheets':
      sendJson(res, 200, await listSheets(SHEETS_DIR))
      return true
  }

  const sheet = /^GET \/sheets\/([^/]+)$/.exec(route)?.[1]
  if (sheet) {
    if (!isSheetFileName(sheet)) throw new HttpError(400, `不正なファイル名: ${sheet}`)
    await sendImage(res, SHEETS_DIR, sheet)
    return true
  }
  const buildingSheet = /^GET \/building-sheets\/([^/]+)$/.exec(route)?.[1]
  if (buildingSheet) {
    if (!isSheetFileName(buildingSheet)) throw new HttpError(400, `不正なファイル名: ${buildingSheet}`)
    await sendImage(res, BUILDING_SHEETS_DIR, buildingSheet)
    return true
  }
  return false
}

export function dataPlugin(): Plugin {
  return {
    name: 'norden-data',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        handle(req, res).then(
          (handled) => { if (!handled) next() },
          (e) => sendJson(res, e instanceof HttpError ? e.status : 500, { error: e instanceof Error ? e.message : String(e) }),
        )
      })
    },
  }
}
