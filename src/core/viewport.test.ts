import { describe, expect, it } from 'vitest';
import { clampScale, fitRect, screenToWorld, worldToScreen, zoomAt, MAX_SCALE, MIN_SCALE } from './viewport';

describe('viewport', () => {
  it('屏幕坐标与世界坐标互为逆变换', () => {
    const v = { x: 40, y: 30, scale: 1.5 };
    const p = screenToWorld(v, 180, 120);
    const back = worldToScreen(v, p.x, p.y);
    expect(back.x).toBeCloseTo(180, 6);
    expect(back.y).toBeCloseTo(120, 6);
  });

  it('以光标为锚缩放时锚点世界坐标不变', () => {
    const v = { x: 10, y: 20, scale: 1 };
    const sx = 320;
    const sy = 240;
    const before = screenToWorld(v, sx, sy);
    const next = zoomAt(v, sx, sy, 2.4);
    const after = screenToWorld(next, sx, sy);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(next.scale).toBeCloseTo(2.4, 6);
  });

  it('缩放被夹在工程允许范围内', () => {
    expect(clampScale(1000)).toBe(MAX_SCALE);
    expect(clampScale(0.0001)).toBe(MIN_SCALE);
  });

  it('适应画板后画板居中且完整可见', () => {
    const rect = { x: -100, y: 50, w: 1440, h: 900 };
    const v = fitRect(rect, 1200, 800, 48);
    const tl = worldToScreen(v, rect.x, rect.y);
    const br = worldToScreen(v, rect.x + rect.w, rect.y + rect.h);
    expect(tl.x).toBeGreaterThanOrEqual(0);
    expect(tl.y).toBeGreaterThanOrEqual(0);
    expect(br.x).toBeLessThanOrEqual(1200);
    expect(br.y).toBeLessThanOrEqual(800);
    expect((tl.x + br.x) / 2).toBeCloseTo(600, 4);
    expect((tl.y + br.y) / 2).toBeCloseTo(400, 4);
  });
});
