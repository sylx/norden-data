import { mkdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** 書き出しが元データの誤りで止まったとき（400 で返す） */
export class ExportError extends Error {}

/** 一時ファイルに書いてから置き換える */
export async function writeAtomic(file: string, data: string | Buffer) {
  await mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  await writeFile(tmp, data)
  await rename(tmp, file)
}
