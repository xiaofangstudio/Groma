import type { ImageCrop, SceneNode } from './types';

export const FULL_IMAGE_CROP: ImageCrop = { x: 0, y: 0, w: 1, h: 1 };
export const MIN_IMAGE_CROP = 0.02;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/**
 * 裁剪区域用归一化坐标存，默认整张图。旧工程没有 imageCrop，直接按全图。
 * 宽高至少保留 2%，越界值在这里收拢，避免画布和导出读到坏数据。
 */
export function normalizeImageCrop(crop?: Partial<ImageCrop> | null): ImageCrop {
  if (!crop || ![crop.x, crop.y, crop.w, crop.h].every((value) => typeof value === 'number' && Number.isFinite(value))) {
    return { ...FULL_IMAGE_CROP };
  }
  const x = clamp01(crop.x as number);
  const y = clamp01(crop.y as number);
  const w = Math.min(1 - x, Math.max(MIN_IMAGE_CROP, crop.w as number));
  const h = Math.min(1 - y, Math.max(MIN_IMAGE_CROP, crop.h as number));
  return { x: round6(x), y: round6(y), w: round6(w), h: round6(h) };
}

export function imageCropOf(node: SceneNode): ImageCrop {
  return normalizeImageCrop(node.imageCrop);
}

export function isFullImageCrop(crop: ImageCrop): boolean {
  return crop.x <= 0.0001 && crop.y <= 0.0001 && crop.w >= 0.9999 && crop.h >= 0.9999;
}

/** 归一化裁剪区域换算成原图像素矩形，供 Canvas drawImage 的九参调用使用。 */
export function imageSourceRect(assetW: number, assetH: number, crop: ImageCrop): { x: number; y: number; w: number; h: number } {
  const width = Math.max(1, assetW);
  const height = Math.max(1, assetH);
  const safe = normalizeImageCrop(crop);
  return {
    x: safe.x * width,
    y: safe.y * height,
    w: Math.max(1, safe.w * width),
    h: Math.max(1, safe.h * height),
  };
}

export function cropPercent(crop: ImageCrop): { x: number; y: number; w: number; h: number } {
  const safe = normalizeImageCrop(crop);
  return {
    x: Math.round(safe.x * 100),
    y: Math.round(safe.y * 100),
    w: Math.round(safe.w * 100),
    h: Math.round(safe.h * 100),
  };
}
