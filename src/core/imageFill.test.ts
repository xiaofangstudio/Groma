import { describe, expect, it } from 'vitest';
import { DEFAULT_IMAGE_FILL, imageFillBox } from './imageFill';

describe('图片填充', () => {
  it('铺满时取 cover，焦点决定溢出保留区域', () => {
    const box = imageFillBox(400, 200, 100, 100, { ...DEFAULT_IMAGE_FILL, mode: 'fill', focusX: 0.5, focusY: 0.5 });
    expect(box).toEqual({ x: -50, y: 0, w: 200, h: 100 });
    const right = imageFillBox(400, 200, 100, 100, { ...DEFAULT_IMAGE_FILL, mode: 'fill', focusX: 1, focusY: 0.5 });
    expect(right.x).toBe(-100);
  });

  it('适应时取 contain，焦点控制留白位置', () => {
    const box = imageFillBox(400, 200, 100, 100, { ...DEFAULT_IMAGE_FILL, mode: 'fit', focusX: 0.5, focusY: 0.5 });
    expect(box).toEqual({ x: 0, y: 25, w: 100, h: 50 });
  });

  it('横图铺满竖向框时按高度放大并居中', () => {
    const box = imageFillBox(400, 200, 60, 120, { ...DEFAULT_IMAGE_FILL, mode: 'fill', focusX: 0.5, focusY: 0.5 });
    expect(box).toEqual({ x: -90, y: 0, w: 240, h: 120 });
  });

  it('焦点越界会收拢到 0–1，零尺寸图不产生除零', () => {
    const box = imageFillBox(0, 0, 100, 100, { ...DEFAULT_IMAGE_FILL, mode: 'fill', focusX: 2, focusY: -1 });
    expect(box.w).toBeCloseTo(100);
    expect(box.h).toBeCloseTo(100);
    expect(box.x).toBeCloseTo(0);
    expect(box.y).toBeCloseTo(0);
    expect(Number.isFinite(box.x)).toBe(true);
    expect(Number.isFinite(box.y)).toBe(true);
  });
});
