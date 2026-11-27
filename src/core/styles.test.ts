import { describe, expect, it } from 'vitest';
import { canCreateStyle, detachedStyleKinds, styleApplyPatch, styleFromNode, styleMatchesNode } from './styles';
import type { SceneNode } from './types';

function node(): SceneNode {
  return {
    id: 'rect-style',
    type: 'rect',
    name: '样式源',
    parentId: 'frame',
    children: [],
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    clipContent: false,
    fills: [
      { type: 'solid', color: '#FF0000', opacity: 0.5 },
      { type: 'solid', color: '#0000FF', opacity: 1 },
    ],
    strokes: [{ color: '#221C00', opacity: 1, width: 2, dash: [], cap: 'butt', join: 'miter' }],
    cornerRadius: 0,
  };
}

describe('命名样式', () => {
  it('从节点创建填充样式，套用时带回绑定和完整多填充', () => {
    const source = node();
    const style = styleFromNode('fill', 'style-1', '品牌红蓝', source);
    expect(style).not.toBeNull();
    expect(canCreateStyle('fill', source)).toBe(true);
    const target = { ...node(), id: 'target', fills: [] };
    const patch = styleApplyPatch(style!, target);
    expect(patch.fills).toHaveLength(2);
    expect(patch.styleRefs).toEqual({ fill: 'style-1' });
    expect(styleMatchesNode(style!, source)).toBe(true);
    expect(styleMatchesNode(style!, target)).toBe(false);
  });

  it('识别直接修改属性时该解除哪类样式', () => {
    expect(detachedStyleKinds({ fills: [] }).sort()).toEqual(['fill']);
    expect(detachedStyleKinds({ strokes: [] }).sort()).toEqual(['stroke']);
    expect(detachedStyleKinds({ effects: [] }).sort()).toEqual(['effect']);
    expect(detachedStyleKinds({ fontSize: 18, text: '不改内容' }).sort()).toEqual(['text']);
  });
});
