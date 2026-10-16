import { mkdir, readdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import type { BuildingImageSetting, BuildingSource } from '../src/buildings/types.ts'
import { BUILDING_SOURCES_DIR, OUTPUT } from './paths.ts'

/** 書き出す画像の一辺（正方形） */
export const BUILDING_IMAGE_SIZE = 256

export const isSourceFileName = (name: string) => /^[\w.-]+\.(png|webp|jpe?g)$/i.test(name) && !name.startsWith('.')

export const isBuildingId = (id: string) => /^[a-z][a-z0-9_]*$/.test(id)

/** buildings/sources/ の元画像と大きさ */
export async function listSources(): Promise<BuildingSource[]> {
  let files: string[]
  try {
    files = (await readdir(BUILDING_SOURCES_DIR)).filter(isSourceFileName).sort()
  } catch {
    return []
  }
  return Promise.all(files.map(async (file) => {
    const { width, height } = await sharp(path.join(BUILDING_SOURCES_DIR, file)).metadata()
    if (!width || !height) throw new Error(`画像の大きさが読めません: ${file}`)
    return { file, width, height }
  }))
}

/** 元画像の範囲を切り抜き、BUILDING_IMAGE_SIZE の正方形に縮めてゲームの src/assets/buildings/<id>.webp に書く */
export async function exportBuildingImage(id: string, setting: BuildingImageSetting): Promise<{ file: string; bytes: number }> {
  if (!isBuildingId(id)) throw new Error(`施設の ID ではありません: ${id}`)
  if (!isSourceFileName(setting.file)) throw new Error(`不正なファイル名: ${setting.file}`)
  const { x, y, size } = setting.crop
  const image = await sharp(path.join(BUILDING_SOURCES_DIR, setting.file))
    .extract({ left: Math.round(x), top: Math.round(y), width: Math.round(size), height: Math.round(size) })
    .resize(BUILDING_IMAGE_SIZE, BUILDING_IMAGE_SIZE, { fit: 'fill' })
    .webp({ quality: 85, effort: 6 })
    .toBuffer()
  const file = path.join(OUTPUT.buildingImages, `${id}.webp`)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(`${file}.tmp`, image)
  await rename(`${file}.tmp`, file)
  return { file, bytes: image.length }
}
