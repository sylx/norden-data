/**
 * エディタの読み書きを受け持つ Vite プラグイン（開発サーバーだけ）。
 *
 * - GET/PUT  /api/cities             ルートの src/data/cityData.json
 * - GET/PUT  /api/characters         characters/characters.json（騎士データの元データ）
 * - POST     /api/characters/export  ルートの characterData.json などに書き出す
 * - GET      /api/sheets             characters/sheets/ の元画像とセルの並び
 * - GET      /sheets/<file>          元画像
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import type { Plugin } from 'vite'
import type { SourceCharacter } from '../src/characters/types.ts'
import { ExportError, exportCharacters } from './exportCharacters.ts'
import { CHARACTERS_FILE, OUTPUT, SHEETS_DIR } from './paths.ts'
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
    case 'POST /api/characters/export': {
      const characters = await readJson(CHARACTERS_FILE)
      assertList(characters)
      try {
        sendJson(res, 200, await exportCharacters(characters as SourceCharacter[]))
      } catch (e) {
        if (e instanceof ExportError) throw new HttpError(400, e.message)
        throw e
      }
      return true
    }
    case 'GET /api/sheets':
      sendJson(res, 200, await listSheets())
      return true
  }

  const sheet = /^GET \/sheets\/([^/]+)$/.exec(route)?.[1]
  if (sheet) {
    if (!isSheetFileName(sheet)) throw new HttpError(400, `不正なファイル名: ${sheet}`)
    let data: Buffer
    try {
      data = await readFile(path.join(SHEETS_DIR, sheet))
    } catch {
      throw new HttpError(404, `見つかりません: ${sheet}`)
    }
    res.statusCode = 200
    res.setHeader('Content-Type', MIME[path.extname(sheet).toLowerCase()] ?? 'application/octet-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.end(data)
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
