import { describe, expect, it } from 'vitest';
import { createDoc } from './doc';
import { applyCommand } from './commands';
import { alignDeltas, distributeDeltas } from './align';
import type { GromaDoc, SceneNode } from './types';

function addRect(doc: GromaDoc, parentId: string, id: string, x: number, y: number, w: number, h: number): GromaDoc {
  const node: SceneNode = {
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
  return applyCommand(doc, { type: 'insert', parentId, node }).doc;
}

function fixture() {
  let doc = createDoc();
  const frameId = doc.nodes[doc.pages[0].rootId].children[0];
  doc = addRect(doc, frameId, 'a', 0, 0, 100, 50);
  doc = addRect(doc, frameId, 'b', 200, 100, 60, 80);
  doc = addRect(doc, frameId, 'c', 500, 200, 20, 20);
  return doc;
}

describe('align / distribute', () => {
  it('左对齐、水平居中、右对齐按选区外接框计算', () => {
    const doc = fixture();
    const left = alignDeltas(doc, ['a', 'b', 'c'], 'left');
    expect(left.find((d) => d.id === 'b')).toEqual({ id: 'b', dx: -200, dy: 0 });
    expect(left.find((d) => d.id === 'c')).toEqual({ id: 'c', dx: -500, dy: 0 });

    const bounds = { x: 0, y: 0, w: 520, h: 220 };
    expect(alignDeltas(doc, ['a', 'b', 'c'], 'hcenter').find((d) => d.id === 'b')).toEqual({
      id: 'b',
      dx: bounds.x + bounds.w / 2 - 230,
      dy: 0,
    });
    expect(alignDeltas(doc, ['a', 'b', 'c'], 'right').find((d) => d.id === 'b')).toEqual({
      id: 'b',
      dx: 260,
      dy: 0,
    });
  });

  it('上对齐、垂直居中、下对齐按选区外接框计算', () => {
    const doc = fixture();
    expect(alignDeltas(doc, ['a', 'b', 'c'], 'top').find((d) => d.id === 'b')).toEqual({
      id: 'b',
      dx: 0,
      dy: -100,
    });
    expect(alignDeltas(doc, ['a', 'b', 'c'], 'vcenter').some((d) => d.id === 'b')).toBe(true);
    expect(alignDeltas(doc, ['a', 'b', 'c'], 'bottom').find((d) => d.id === 'b')).toEqual({
      id: 'b',
      dx: 0,
      dy: 40,
    });
  });

  it('水平等间距：首尾贴住外接框，中间按等 gap 分布', () => {
    const doc = fixture();
    const deltas = distributeDeltas(doc, ['a', 'b', 'c'], 'horizontal');
    expect(deltas).toEqual([{ id: 'b', dx: 70, dy: 0 }]);
  });

  it('垂直等间距：少于 3 个节点返回空', () => {
    const doc = fixture();
    expect(distributeDeltas(doc, ['a', 'b'], 'vertical')).toEqual([]);
    const deltas = distributeDeltas(doc, ['a', 'b', 'c'], 'vertical');
    expect(deltas.length).toBeGreaterThan(0);
    expect(deltas.every((d) => d.dx === 0)).toBe(true);
  });
});
