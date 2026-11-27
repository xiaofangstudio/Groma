import { describe, expect, it } from 'vitest';
import { createDoc } from './doc';
import { applyConstraintsOnResize, constrainedRect, DEFAULT_CONSTRAINTS } from './constraints';
import type { SceneNode } from './types';

function node(id: string, parentId: string, patch: Partial<SceneNode> = {}): SceneNode {
  return {
    id,
    type: 'rect',
    name: id,
    parentId,
    children: [],
    x: 0,
    y: 0,
    w: 10,
    h: 10,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    clipContent: false,
    fills: [],
    cornerRadius: 0,
    ...patch,
  };
}

describe('约束', () => {
  const parent = node('parent', 'page', { type: 'frame', w: 100, h: 100 });
  const resized = { ...parent, w: 200, h: 200 };

  it('缺省左上固定不移动', () => {
    const child = node('child', 'parent', { x: 20, y: 30, w: 40, h: 50 });
    expect(constrainedRect(parent, resized, child)).toEqual({ x: 20, y: 30, w: 40, h: 50 });
    expect(child.constraints ?? DEFAULT_CONSTRAINTS).toEqual({ horizontal: 'left', vertical: 'top' });
  });

  it('右固定、居中、拉伸与缩放', () => {
    const right = node('right', 'parent', { x: 20, y: 30, w: 40, h: 50, constraints: { horizontal: 'right', vertical: 'center' } });
    expect(constrainedRect(parent, resized, right)).toEqual({ x: 120, y: 80, w: 40, h: 50 });

    const stretch = node('stretch', 'parent', { x: 20, y: 30, w: 40, h: 50, constraints: { horizontal: 'leftRight', vertical: 'topBottom' } });
    expect(constrainedRect(parent, resized, stretch)).toEqual({ x: 20, y: 30, w: 140, h: 150 });

    const scale = node('scale', 'parent', { x: 20, y: 30, w: 40, h: 50, constraints: { horizontal: 'scale', vertical: 'scale' } });
    expect(constrainedRect(parent, resized, scale)).toEqual({ x: 40, y: 60, w: 80, h: 100 });
  });

  it('父画板尺寸变化时写入子节点，并继续向下约束', () => {
    const doc = createDoc('约束', 100, 100);
    const pageId = doc.pages[0].rootId;
    const frameId = doc.nodes[pageId].children[0];
    doc.nodes[frameId] = { ...doc.nodes[frameId], w: 100, h: 100, clipContent: true };
    const child = node('child-frame', frameId, {
      type: 'frame',
      x: 20,
      y: 20,
      w: 50,
      h: 50,
      constraints: { horizontal: 'scale', vertical: 'scale' },
    });
    const grand = node('grand', child.id, {
      x: 10,
      y: 10,
      w: 20,
      h: 20,
      constraints: { horizontal: 'right', vertical: 'bottom' },
    });
    child.children = [grand.id];
    doc.nodes[child.id] = child;
    doc.nodes[grand.id] = grand;
    doc.nodes[frameId].children = [child.id];

    const before = doc.nodes[frameId];
    const after = { ...before, w: 200, h: 200 };
    const next = applyConstraintsOnResize(doc, frameId, before, after);
    expect(next.nodes[child.id]).toMatchObject({ x: 40, y: 40, w: 100, h: 100 });
    expect(next.nodes[grand.id]).toMatchObject({ x: 60, y: 60, w: 20, h: 20 });
  });
});
