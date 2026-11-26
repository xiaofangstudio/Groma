import { describe, expect, it } from 'vitest';
import { activeEffects, effectsFilter, effectsPadding, shadowColor } from './effects';
import type { Effect } from './types';

describe('图层效果', () => {
  it('只返回可见效果，空节点得到空表', () => {
    const effects: Effect[] = [
      { type: 'drop-shadow', x: 0, y: 8, blur: 16, color: '#221C00', opacity: 0.25, visible: true },
      { type: 'layer-blur', blur: 8, visible: false },
    ];
    expect(activeEffects({ effects } as never)).toHaveLength(1);
    expect(activeEffects({} as never)).toEqual([]);
  });

  it('投影按偏移与模糊外扩，层模糊按半径外扩', () => {
    expect(
      effectsPadding([
        { type: 'drop-shadow', x: 12, y: -20, blur: 30, color: '#000000', opacity: 1, visible: true },
        { type: 'layer-blur', blur: 6, visible: true },
      ]),
    ).toBe(100);
  });

  it('组合滤镜只拼接层模糊，投影单独着色', () => {
    const filter = effectsFilter([
      { type: 'layer-blur', blur: 4, visible: true },
      { type: 'drop-shadow', x: 0, y: 2, blur: 8, color: '#000000', opacity: 0.5, visible: true },
    ]);
    expect(filter).toBe('blur(4px)');
    expect(
      shadowColor({ type: 'drop-shadow', x: 0, y: 2, blur: 8, color: '#112233', opacity: 0.5, visible: true }),
    ).toBe('rgba(17, 34, 51, 0.5)');
  });
});
