/** 施設の画像の元データ（buildings/images.json）と元画像（buildings/sources/） */

/** buildings/sources/ の元画像 */
export interface BuildingSource {
  file: string
  width: number
  height: number
}

/** 正方形の範囲（元画像のピクセル） */
export interface SquareCrop {
  x: number
  y: number
  size: number
}

/** 施設の画像に使う元画像と、切り抜く範囲 */
export interface BuildingImageSetting {
  file: string
  crop: SquareCrop
}

/** 施設の ID → 画像の設定 */
export type BuildingImageSettings = Record<string, BuildingImageSetting>

/** 元画像全体に収まる一番大きい正方形を中央に */
export function defaultCrop(source: BuildingSource): SquareCrop {
  const size = Math.min(source.width, source.height)
  return { x: Math.round((source.width - size) / 2), y: Math.round((source.height - size) / 2), size }
}
