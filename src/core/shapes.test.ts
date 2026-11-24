import { describe, expect, it } from 'vitest';
import { polygonPath, shapePath, starPath } from './shapes';

function vertices(path: string): string[] {
  return path.split(/[ML]/).map((part) => part.trim()).filter(Boolean);
}

describe('多边形与星形几何', () => {
  it('五边形从正上方起笔并闭合', () => {
    const path = polygonPath(200, 200, 5);
    expect(path.startsWith('M 100 0 L ')).toBe(true);
    expect(path.endsWith(' Z')).toBe(true);
    expect(vertices(path)).toHaveLength(5);
  });

  it('边数被夹在 3–12，宽高非等比时顶点落在包围盒内', () => {
    const wide = polygonPath(300, 150, 2);
    expect(vertices(wide)).toHaveLength(3);
    expect(wide.startsWith('M 150 0')).toBe(true);

    const many = polygonPath(200, 200, 20);
    expect(vertices(many)).toHaveLength(12);
  });

  it('五角星有 10 个顶点，内径比例生效', () => {
    const path = starPath(200, 200, 5, 0.4);
    expect(vertices(path)).toHaveLength(10);
    expect(path.endsWith(' Z')).toBe(true);
    expect(path).not.toContain('NaN');
  });

  it('shapePath 按类型分派', () => {
    expect(shapePath('polygon', 120, 120, 6)).toBe(polygonPath(120, 120, 6));
    expect(shapePath('star', 120, 120, 5, 0.5)).toBe(starPath(120, 120, 5, 0.5));
  });
});
