import { describe, expect, it } from 'vitest';
import { arrowGeometry, arrowHeadSize } from './arrow';

function lastPoint(pathData: string): { x: number; y: number } {
  const match = [...pathData.matchAll(/L\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)].at(-1);
  if (!match) throw new Error(`没有找到终点：${pathData}`);
  return { x: Number(match[1]), y: Number(match[2]) };
}

describe('箭头几何', () => {
  it('水平箭头把三角头高度计入包围盒', () => {
    const g = arrowGeometry({ x: 10, y: 20 }, { x: 130, y: 20 });
    expect(g.x).toBe(10);
    expect(g.w).toBe(120);
    expect(g.h).toBeGreaterThan(1);
    expect(g.pathData.startsWith('M ')).toBe(true);
    expect(g.arrowHeadData.startsWith('M ')).toBe(true);
    expect(g.arrowHeadData.endsWith(' Z')).toBe(true);
    const tip = lastPoint(g.pathData);
    expect(tip.x).toBeGreaterThan(115);
    expect(tip.y).toBeGreaterThan(0);
  });

  it('斜向箭头终点与三角头尖端重合', () => {
    const g = arrowGeometry({ x: 40, y: 30 }, { x: 200, y: 170 });
    const tip = lastPoint(g.pathData);
    const tri = g.arrowHeadData.match(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g) ?? [];
    const apex = tri[1].split(/\s+/).map(Number);
    expect(tip.x).toBe(apex[0]);
    expect(tip.y).toBe(apex[1]);
    expect(g.pathW).toBe(g.w);
    expect(g.pathH).toBe(g.h);
  });

  it('起止点过近时按 120×60 兜底', () => {
    const g = arrowGeometry({ x: 0, y: 0 }, { x: 1, y: 1 });
    expect(g.w).toBe(120);
    expect(g.h).toBeGreaterThan(1);
  });

  it('箭头头部尺寸随线长增长并夹取', () => {
    expect(arrowHeadSize(10)).toBe(8);
    expect(arrowHeadSize(100)).toBeCloseTo(18);
    expect(arrowHeadSize(600)).toBe(24);
  });
});
