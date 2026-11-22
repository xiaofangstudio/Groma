import type { Viewport } from './viewport';
import type { Guide } from './types';

export const GUIDE_HIT_PX = 4;

/**
 * 参考线在画布内容坐标里的位置。
 * 内容坐标不含标尺；调用方传进来的指针坐标也已经扣掉标尺。
 */
export function guideScreenPosition(guide: Guide, viewport: Viewport): number {
  return guide.axis === 'x'
    ? guide.position * viewport.scale + viewport.x
    : guide.position * viewport.scale + viewport.y;
}

export function hitTestGuide(
  guides: Guide[],
  point: { x: number; y: number },
  viewport: Viewport,
  tolerance = GUIDE_HIT_PX,
): { index: number; guide: Guide } | null {
  for (let index = 0; index < guides.length; index += 1) {
    const guide = guides[index];
    const screen = guideScreenPosition(guide, viewport);
    const pointer = guide.axis === 'x' ? point.x : point.y;
    if (Math.abs(pointer - screen) <= tolerance) return { index, guide };
  }
  return null;
}
