import { describe, expect, it } from 'vitest';
import { addFill, fillStack, moveFill, removeFill, toggleFillVisible, updateFill, MAX_FILLS } from './fills';
import type { Paint } from './types';

const red: Paint = { type: 'solid', color: '#FF0000', opacity: 1 };
const blue: Paint = { type: 'solid', color: '#0000FF', opacity: 0.5 };
const green: Paint = { type: 'solid', color: '#00FF00', opacity: 1 };

describe('多填充', () => {
  it('数组顶层在前，绘制栈从底层到顶层', () => {
    const fills = addFill([blue], red);
    expect(fills[0]).toBe(red);
    expect(fills[1]).toBe(blue);
    expect(fillStack(fills)).toEqual([blue, red]);
  });

  it('增删改、上下移动与显隐', () => {
    let fills: Paint[] = [red, blue, green];
    expect(updateFill(fills, 1, { ...blue, opacity: 0.2 })[1].opacity).toBe(0.2);
    expect(removeFill(fills, 1)).toEqual([red, green]);
    expect(moveFill(fills, 0, 1)).toEqual([blue, red, green]);
    expect(moveFill(fills, 0, -1)).toEqual(fills);
    expect(toggleFillVisible(fills, 1)[1].visible).toBe(false);
    expect(toggleFillVisible(toggleFillVisible(fills, 1), 1)[1].visible).toBe(true);
  });

  it('隐藏层不进入绘制栈，最多 16 层', () => {
    const hidden = { ...red, visible: false };
    expect(fillStack([red, hidden])).toEqual([red]);
    const many = Array.from({ length: MAX_FILLS + 3 }, (_, i) => ({ ...red, color: `#0000${i.toString(16).padStart(2, '0')}` }));
    expect(addFill(many, blue)).toHaveLength(MAX_FILLS + 3);
    expect(fillStack(many)).toHaveLength(MAX_FILLS);
  });
});
