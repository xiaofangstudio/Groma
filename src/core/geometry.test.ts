import { describe, expect, it } from 'vitest';
import { createDoc } from './doc';
import {
  absolutePosition,
  absoluteRect,
  deepestFrame,
  hitTest,
  hitTestDeep,
  marqueeSelection,
} from './geometry';
import type { SceneNode } from './types';

function makeChild(id: string, parentId: string, x: number, y: number, w: number, h: number): SceneNode {
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

function makeGroup(id: string, parentId: string, x: number, y: number, w: number, h: number, children: string[]): SceneNode {
  return {
    id,
    type: 'group',
    name: id,
    parentId,
    children,
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

describe('geometry', () => {
  it('嵌套节点的绝对坐标逐级累加', () => {
    const doc = createDoc();
    const page = doc.pages[0];
    const root = doc.nodes[page.rootId];
    const frame = doc.nodes[root.children[0]];
    frame.x = 100;
    frame.y = 50;

    const child = makeChild('rect-1', frame.id, 20, 10, 200, 100);
    doc.nodes[child.id] = child;
    doc.nodes[frame.id] = { ...frame, children: [child.id] };

    expect(absolutePosition(doc, child.id)).toEqual({ x: 120, y: 60 });
    expect(absoluteRect(doc, child.id)).toEqual({ x: 120, y: 60, w: 200, h: 100 });
  });

  it('命中测试优先子节点，其次画板，画板外为空', () => {
    const doc = createDoc();
    const page = doc.pages[0];
    const root = doc.nodes[page.rootId];
    const frame = doc.nodes[root.children[0]];
    const child = makeChild('rect-1', frame.id, 20, 10, 200, 100);
    doc.nodes[child.id] = child;
    doc.nodes[frame.id] = { ...frame, children: [child.id] };

    expect(hitTest(doc, page, 120, 60)?.id).toBe(child.id);
    expect(hitTest(doc, page, 500, 500)?.id).toBe(frame.id);
    expect(hitTest(doc, page, -20, -20)).toBeNull();
  });

  it('新图形会挂到最深一层可用画板', () => {
    const doc = createDoc();
    const page = doc.pages[0];
    const root = doc.nodes[page.rootId];
    const frame = doc.nodes[root.children[0]];
    expect(deepestFrame(doc, page, 100, 100)?.id).toBe(frame.id);
    expect(deepestFrame(doc, page, -100, -100)).toBeNull();
  });

  it('框选完整框住分组时选分组，只压到一部分时选真正命中的子节点', () => {
    const doc = createDoc();
    const page = doc.pages[0];
    const root = doc.nodes[page.rootId];
    const frame = doc.nodes[root.children[0]];
    const r1 = makeChild('r1', 'g', 0, 0, 30, 30);
    const r2 = makeChild('r2', 'g', 70, 70, 30, 30);
    const group = makeGroup('g', frame.id, 20, 10, 100, 100, ['r1', 'r2']);
    doc.nodes.g = group;
    doc.nodes.r1 = r1;
    doc.nodes.r2 = r2;
    doc.nodes[frame.id] = { ...frame, children: ['g'] };

    expect(marqueeSelection(doc, page, { x: 10, y: 0, w: 120, h: 120 })).toEqual(['g']);
    expect(marqueeSelection(doc, page, { x: 15, y: 5, w: 50, h: 50 })).toEqual(['r1']);

    doc.nodes.g = { ...group, locked: true };
    expect(marqueeSelection(doc, page, { x: 15, y: 5, w: 50, h: 50 })).toEqual([frame.id]);
  });

  it('单击分组选最外层组，双击可穿透到组内子节点', () => {
    const doc = createDoc();
    const page = doc.pages[0];
    const root = doc.nodes[page.rootId];
    const frame = doc.nodes[root.children[0]];
    const inner = makeChild('inner', 'g', 10, 10, 50, 50);
    const group = makeGroup('g', frame.id, 100, 100, 200, 100, ['inner']);
    doc.nodes.g = group;
    doc.nodes.inner = inner;
    doc.nodes[frame.id] = { ...frame, children: ['g'] };

    expect(hitTest(doc, page, 120, 120)?.id).toBe('g');
    expect(hitTestDeep(doc, page, 120, 120)?.id).toBe('inner');
  });

  it('分组外接框跟随子节点，子节点拖出旧范围后仍可命中', () => {
    const doc = createDoc();
    const page = doc.pages[0];
    const root = doc.nodes[page.rootId];
    const frame = doc.nodes[root.children[0]];
    const inner = makeChild('inner', 'g', 300, 10, 50, 50);
    const group = makeGroup('g', frame.id, 100, 100, 200, 100, ['inner']);
    doc.nodes.g = group;
    doc.nodes.inner = inner;
    doc.nodes[frame.id] = { ...frame, children: ['g'] };

    expect(absoluteRect(doc, 'g')).toEqual({ x: 400, y: 110, w: 50, h: 50 });
    expect(hitTest(doc, page, 420, 130)?.id).toBe('g');
  });
});
