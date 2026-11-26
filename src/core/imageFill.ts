export type ImageFillMode = 'fill' | 'fit';

/** 形状上的图片填充：cover/fit + 焦点 (0–1)，独立于渐变 fills。 */
export interface ImageFill {
  assetId: string;
  mode: ImageFillMode;
  focusX: number;
  focusY: number;
  opacity: number;
}

export const DEFAULT_IMAGE_FILL: Omit<ImageFill, 'assetId'> = {
  mode: 'fill',
  focusX: 0.5,
  focusY: 0.5,
  opacity: 1,
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function imageFillOf(node: { imageFill?: ImageFill }): ImageFill | undefined {
  return node.imageFill;
}

/**
 * 计算图片在形状框内的目标矩形。
 * fill = cover（铺满，溢出由形状裁剪），fit = contain（完整图，留空透明）。
 * focus 决定 cover 溢出时保留哪一块，以及 fit 时的对齐位置。
 */
export function imageFillBox(
  imageW: number,
  imageH: number,
  boxW: number,
  boxH: number,
  fill: Pick<ImageFill, 'mode' | 'focusX' | 'focusY'>,
): { x: number; y: number; w: number; h: number } {
  const iw = Math.max(0.01, imageW);
  const ih = Math.max(0.01, imageH);
  const bw = Math.max(0.01, boxW);
  const bh = Math.max(0.01, boxH);
  const scale = fill.mode === 'fit' ? Math.min(bw / iw, bh / ih) : Math.max(bw / iw, bh / ih);
  const w = iw * scale;
  const h = ih * scale;
  const focusX = clamp01(fill.focusX);
  const focusY = clamp01(fill.focusY);
  return { x: (bw - w) * focusX, y: (bh - h) * focusY, w, h };
}
