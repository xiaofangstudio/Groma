import { describe, expect, it } from 'vitest';
import { createDoc } from './doc';
import {
  collectSnapTargets,
  snapResizeRect,
  snapSelectionBounds,
} from './snapping';
import type { SceneNode } from './types';

function makeNode(id: string, parentId: string, x: number, y: number, w: number, h: number): SceneNode {
  return {
    id,
    type: 'rect',
    name: id,
    parentId,
    children: [],
    x,
    y,
    w,
    h,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    clipContent: false,
    fills: [],
    cornerRadius: 0,
  };
}

describe('snapping', () => {
  it('拖动时左边贴目标左边，并给出竖参考线', () => {
    const result = snapSelectionBounds(
      { x: 96, y: 100, w: 50, h: 30 },
      [{ x: 100, y: 200, w: 80, h: 40 }],
      6,
    );
    expect(result.dx).toBe(4);
    expect(result.dy).toBe(0);
    expect(result.guides).toHaveLength(1);
    expect(result.guides[0]).toEqual({ axis: 'x', position: 100, start: 100, end: 240 });
  });

  it('拖动时中心贴中心', () => {
    const result = snapSelectionBounds(
      { x: 90, y: 100, w: 100, h: 40 },
      [{ x: 100, y: 300, w: 80, h: 40 }],
      6,
    );
    expect(result.dx).toBe(0);
    expect(result.dy).toBe(0);
    expect(result.guides).toEqual([{ axis: 'x', position: 140, start: 100, end: 340 }]);
  });

  it('超过阈值不吸附', () => {
    const result = snapSelectionBounds(
      { x: 96, y: 100, w: 50, h: 30 },
      [{ x: 200, y: 200, w: 80, h: 40 }],
      6,
    );
    expect(result).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  it('按住 Alt 关闭吸附', () => {
    const bounds = { x: 96, y: 100, w: 50, h: 30 };
    const targets = [{ x: 100, y: 200, w: 80, h: 40 }];
    const result = snapSelectionBounds(bounds, targets, 6, true);
    expect(result).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  it('缩放右边时左边不动，宽度跟着目标变', () => {
    const result = snapResizeRect(
      { x: 10, y: 100, w: 100, h: 50 },
      'right',
      null,
      [{ x: 114, y: 500, w: 20, h: 20 }],
      6,
    );
    expect(result.rect).toEqual({ x: 10, y: 100, w: 104, h: 50 });
    expect(result.guides).toHaveLength(1);
    expect(result.guides[0].axis).toBe('x');
    expect(result.guides[0].position).toBe(114);
  });

  it('缩放左上角时只吸正在拖的两条边', () => {
    const result = snapResizeRect(
      { x: 30, y: 30, w: 100, h: 60 },
      'left',
      'top',
      [{ x: 20, y: 20, w: 4, h: 4 }],
      6,
    );
    expect(result.rect).toEqual({ x: 24, y: 24, w: 106, h: 66 });
    expect(result.guides.map((guide) => guide.axis).sort()).toEqual(['x', 'y']);
  });

  it('拖动时吸附到页级手动竖线', () => {
    const result = snapSelectionBounds(
      { x: 96, y: 100, w: 50, h: 30 },
      [],
      6,
      false,
      [{ axis: 'x', position: 100 }],
    );
    expect(result.dx).toBe(4);
    expect(result.dy).toBe(0);
    expect(result.guides).toEqual([{ axis: 'x', position: 100, start: 100, end: 130, manual: true }]);
  });

  it('缩放时吸附到页级手动横线', () => {
    const result = snapResizeRect(
      { x: 10, y: 100, w: 100, h: 50 },
      null,
      'bottom',
      [],
      6,
      false,
      [{ axis: 'y', position: 156 }],
    );
    expect(result.rect).toEqual({ x: 10, y: 100, w: 100, h: 56 });
    expect(result.guides).toEqual([{ axis: 'y', position: 156, start: 10, end: 110, manual: true }]);
  });

  it('吸附目标排除选区子树，但保留父画板和兄弟节点', () => {
    const doc = createDoc();
    const page = doc.pages[0];
    const root = doc.nodes[page.rootId];
    const frame = doc.nodes[root.children[0]];
    const selected = makeNode('selected', frame.id, 20, 30, 50, 40);
    const sibling = makeNode('sibling', frame.id, 200, 30, 60, 40);
    const hidden = { ...makeNode('hidden', frame.id, 300, 30, 60, 40), visible: false };
    const locked = { ...makeNode('locked', frame.id, 400, 30, 60, 40), locked: true };
    frame.children = [selected.id, sibling.id, hidden.id, locked.id];
    doc.nodes[selected.id] = selected;
    doc.nodes[sibling.id] = sibling;
    doc.nodes[hidden.id] = hidden;
    doc.nodes[locked.id] = locked;

    const targets = collectSnapTargets(doc, page, [selected.id]);
    expect(targets.map((rect) => rect.x).sort((a, b) => a - b)).toEqual([0, 200]);
  });

  it('吸附目标排除选中画板自身与子树，但仍保留画板外节点', () => {
    const doc = createDoc();
    const page = doc.pages[0];
    const root = doc.nodes[page.rootId];
    const frame = doc.nodes[root.children[0]];
    const child = makeNode('inside', frame.id, 20, 30, 50, 40);
    const outside = makeNode('outside', root.id, 1500, 40, 100, 50);
    frame.children = [child.id];
    root.children = [frame.id, outside.id];
    doc.nodes[child.id] = child;
    doc.nodes[outside.id] = outside;

    const targets = collectSnapTargets(doc, page, [frame.id]);
    expect(targets).toHaveLength(1);
    expect(targets[0]).toEqual({ x: 1500, y: 40, w: 100, h: 50 });
  });
});
