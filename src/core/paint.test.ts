import { describe, expect, it } from 'vitest';
import {
  addGradientStop,
  createGradient,
  linearAngle,
  linearGradientOffsetAt,
  linearGradientPoint,
  moveLinearGradient,
  paintPreview,
  removeGradientStop,
  rotateLinearGradient,
  setGradientStopOffset,
  setLinearGradientEndpoint,
  toGradientPaint,
  toSolidPaint,
  updateGradientStops,
} from './paint';
import type { Paint } from './types';

describe('渐变填充编辑', () => {
  it('纯色切换为线性渐变时保留主色并生成两个色标', () => {
    const solid: Paint = { type: 'solid', color: '#E5484D', opacity: 0.9 };
    const gradient = toGradientPaint(solid, 'linear', '#FFFFFF', 420, 220);
    expect(gradient.type).toBe('linear');
    expect(gradient.stops).toHaveLength(2);
    expect(gradient.stops[0].color).toBe('#E5484D');
    expect(gradient.stops[0].opacity).toBe(1);
    expect(gradient.stops[1].offset).toBe(1);
    expect(gradient.opacity).toBe(0.9);
  });

  it('线性换径向时保留色标，不会重置用户改过的颜色', () => {
    const linear = createGradient('linear', '#112233', 1, 300, 180);
    const custom = updateGradientStops(linear, [
      { offset: 0, color: '#FF0000', opacity: 1 },
      { offset: 0.4, color: '#00FF00', opacity: 0.7 },
      { offset: 1, color: '#0000FF', opacity: 0.2 },
    ]);
    const radial = toGradientPaint(custom, 'radial', '#FFFFFF', 300, 180);
    expect(radial.type).toBe('radial');
    expect(radial.stops.map((s) => s.color)).toEqual(['#FF0000', '#00FF00', '#0000FF']);
    expect(radial.cx).toBe(150);
    expect(radial.cy).toBe(90);
  });

  it('渐变切回纯色时用首色标，并把首色标透明度并进填充透明度', () => {
    const gradient = updateGradientStops(createGradient('linear', '#123456', 0.8, 200, 100), [
      { offset: 0, color: '#ABCDEF', opacity: 0.5 },
      { offset: 1, color: '#000000', opacity: 1 },
    ]);
    const solid = toSolidPaint(gradient, '#FFFFFF');
    expect(solid).toEqual({ type: 'solid', color: '#ABCDEF', opacity: 0.4 });
  });

  it('调整线性角度保持中点与长度不变', () => {
    const linear = { ...createGradient('linear', '#000000', 1, 200, 100), x1: 20, y1: 30, x2: 180, y2: 70 };
    const next = rotateLinearGradient(linear, 90);
    expect((next.x1 + next.x2) / 2).toBeCloseTo(100, 6);
    expect((next.y1 + next.y2) / 2).toBeCloseTo(50, 6);
    expect(Math.hypot(next.x2 - next.x1, next.y2 - next.y1)).toBeCloseTo(Math.hypot(160, 40), 6);
    expect(linearAngle(next)).toBeCloseTo(90, 5);
  });

  it('增删色标后始终按位置排序，且不会少于两个', () => {
    const linear = createGradient('linear', '#000000', 1, 100, 100);
    const added = addGradientStop(linear);
    expect(added.stops).toHaveLength(3);
    expect(added.stops.map((s) => s.offset)).toEqual([0, 0.5, 1]);
    const removed = removeGradientStop(added, 1);
    expect(removed.stops).toHaveLength(2);
    expect(removeGradientStop(removed, 0)).toBe(removed);
  });

  it('新增色标取两侧颜色的中间值，而不是复制左端色', () => {
    const linear = updateGradientStops(createGradient('linear', '#000000', 1, 100, 100), [
      { offset: 0, color: '#FF0000', opacity: 1 },
      { offset: 1, color: '#0000FF', opacity: 1 },
    ]);
    const added = addGradientStop(linear);
    expect(added.stops[1]).toEqual({ offset: 0.5, color: '#800080', opacity: 1 });
  });

  it('预览把透明色标换算成 rgba，编辑时看到真实淡出', () => {
    const gradient = createGradient('linear', '#E5484D', 1, 300, 200);
    const preview = paintPreview(gradient, 300, 200);
    expect(preview.startsWith('linear-gradient(90deg')).toBe(true);
    expect(preview).toContain('rgba(229, 72, 77, 0.2)');
  });

  it('整条线性渐变平移时角度、长度、色标都不变', () => {
    const linear = { ...createGradient('linear', '#000000', 1, 200, 100), x1: 20, y1: 30, x2: 180, y2: 70 };
    const moved = moveLinearGradient(linear, 12, 25);
    expect(moved.x1).toBe(32);
    expect(moved.y1).toBe(55);
    expect(moved.x2).toBe(192);
    expect(moved.y2).toBe(95);
    expect(linearAngle(moved)).toBeCloseTo(linearAngle(linear), 6);
    expect(moved.stops).toEqual(linear.stops);
  });

  it('拖端点只改一端，另一端与色标保持', () => {
    const linear = { ...createGradient('linear', '#000000', 1, 200, 100), x1: 20, y1: 30, x2: 180, y2: 70 };
    const next = setLinearGradientEndpoint(linear, 'end', 50, 160);
    expect(next.x1).toBe(20);
    expect(next.y1).toBe(30);
    expect(next.x2).toBe(50);
    expect(next.y2).toBe(160);
    expect(next.stops).toEqual(linear.stops);
    expect(linearGradientPoint(next, 0.5)).toEqual({ x: 35, y: 95 });
    expect(linearGradientOffsetAt(next, 50, 160)).toBe(1);
    expect(linearGradientOffsetAt(next, 20, 30)).toBe(0);
  });

  it('画布拖色标只移动指定色标并夹在 0-1', () => {
    const linear = updateGradientStops(createGradient('linear', '#000000', 1, 100, 100), [
      { offset: 0, color: '#FF0000', opacity: 1 },
      { offset: 0.5, color: '#00FF00', opacity: 1 },
      { offset: 1, color: '#0000FF', opacity: 1 },
    ]);
    const moved = setGradientStopOffset(linear, 1, 0.72);
    expect(moved.stops.map((stop) => stop.offset)).toEqual([0, 0.72, 1]);
    expect(moved.stops[1].color).toBe('#00FF00');
    expect(setGradientStopOffset(linear, 1, -0.3).stops[1].offset).toBe(0);
    expect(setGradientStopOffset(linear, 1, 1.8).stops[1].offset).toBe(1);
  });
});
