import { describe, expect, it } from 'vitest';
import { lineGeometry } from './line';

describe('直线几何', () => {
  it('右下方向生成局部坐标路径与包围盒', () => {
    const line = lineGeometry({ x: 40, y: 60 }, { x: 200, y: 140 });
    expect([line.x, line.y, line.w, line.h]).toEqual([40, 60, 160, 80]);
    expect(line.pathData).toBe('M 0 0 L 160 80');
    expect(line.pathW).toBe(160);
    expect(line.pathH).toBe(80);
  });

  it('左上方向把终点归一到包围盒内', () => {
    const line = lineGeometry({ x: 400, y: 300 }, { x: 100, y: 120 });
    expect([line.x, line.y, line.w, line.h]).toEqual([100, 120, 300, 180]);
    expect(line.pathData).toBe('M 300 180 L 0 0');
  });

  it('水平与垂直线仍保留 1 像素厚度', () => {
    const horizontal = lineGeometry({ x: 0, y: 20 }, { x: 240, y: 20 });
    expect(horizontal.pathData).toBe('M 0 0 L 240 0');
    expect(horizontal.h).toBe(1);
    expect(horizontal.pathH).toBe(1);

    const vertical = lineGeometry({ x: 20, y: 0 }, { x: 20, y: 240 });
    expect(vertical.pathData).toBe('M 0 0 L 0 240');
    expect(vertical.w).toBe(1);
    expect(vertical.pathW).toBe(1);
  });

  it('单击兜底为 120×80 的可见斜线', () => {
    const line = lineGeometry({ x: 50, y: 50 }, { x: 51, y: 50 });
    expect(line.pathData).toBe('M 0 0 L 120 80');
    expect(line.w).toBe(120);
    expect(line.h).toBe(80);
  });
});
