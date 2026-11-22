import type { Rect } from './types';

export const MIN_SCALE = 0.02;
export const MAX_SCALE = 64;

export interface Viewport {
  /** 世界原点在画布内容区里的屏幕坐标 */
  x: number;
  y: number;
  scale: number;
}

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function screenToWorld(v: Viewport, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - v.x) / v.scale, y: (sy - v.y) / v.scale };
}

export function worldToScreen(v: Viewport, wx: number, wy: number): { x: number; y: number } {
  return { x: wx * v.scale + v.x, y: wy * v.scale + v.y };
}

/** 以某个屏幕点为锚缩放，滚轮缩放必须用这个 */
export function zoomAt(v: Viewport, sx: number, sy: number, factor: number): Viewport {
  const scale = clampScale(v.scale * factor);
  if (scale === v.scale) return v;
  const wx = (sx - v.x) / v.scale;
  const wy = (sy - v.y) / v.scale;
  return { scale, x: sx - wx * scale, y: sy - wy * scale };
}

export function fitRect(rect: Rect, viewW: number, viewH: number, padding = 48): Viewport {
  const sw = Math.max(1, viewW - padding * 2);
  const sh = Math.max(1, viewH - padding * 2);
  const scale = clampScale(Math.min(sw / Math.max(rect.w, 1), sh / Math.max(rect.h, 1)));
  return {
    scale,
    x: (viewW - rect.w * scale) / 2 - rect.x * scale,
    y: (viewH - rect.h * scale) / 2 - rect.y * scale,
  };
}
