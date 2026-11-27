import { describe, expect, it } from 'vitest';
import { createDoc } from './doc';
import { applyCommand } from './commands';
import { defaultAutoLayout, isAutoLayoutChild, reflowPageFrom } from './autoLayout';
import type { GromaDoc, SceneNode } from './types';

function frameOf(doc: GromaDoc): SceneNode {
  return doc.nodes[doc.nodes[doc.pages[0].rootId].children[0]];
}

function box(doc: GromaDoc, id: string, w: number, h: number, x = 0, y = 0): SceneNode {
  const frame = frameOf(doc);
  const node: SceneNode = {
    id,
    type: 'rect',
    name: id,
    parentId: frame.id,
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
  doc.nodes[id] = node;
  frame.children.push(id);
  return node;
}

function docWithFrame(): GromaDoc {
  const doc = createDoc('布局', 500, 300);
  const frame = frameOf(doc);
  frame.w = 400;
  frame.h = 200;
  frame.children = [];
  frame.layout = defaultAutoLayout();
  return doc;
}

describe('自动布局', () => {
  it('横向：内边距、间距与居中交叉轴', () => {
    const doc = docWithFrame();
    box(doc, 'a', 100, 40);
    box(doc, 'b', 60, 80);
    frameOf(doc).layout = { ...defaultAutoLayout(), gap: 10, align: 'center' };
    const next = reflowPageFrom(doc, 'a');
    expect(next.nodes.a.x).toBe(16);
    expect(next.nodes.b.x).toBe(126);
    expect(next.nodes.a.y).toBe(80);
    expect(next.nodes.b.y).toBe(60);
  });

  it('纵向：拉伸铺满内宽，主轴居中', () => {
    const doc = docWithFrame();
    box(doc, 'a', 100, 40);
    frameOf(doc).layout = { ...defaultAutoLayout(), mode: 'vertical', gap: 8, align: 'stretch', justify: 'center' };
    const next = reflowPageFrom(doc, 'a');
    expect(next.nodes.a.x).toBe(16);
    expect(next.nodes.a.w).toBe(368);
    expect(next.nodes.a.y).toBe(80);
  });

  it('hug 时主轴包住内容，space-between 分摊余量', () => {
    const doc = docWithFrame();
    box(doc, 'a', 100, 20);
    box(doc, 'b', 50, 20);
    frameOf(doc).layout = { ...defaultAutoLayout(), gap: 10, hug: true, justify: 'space-between' };
    const next = reflowPageFrom(doc, 'a');
    expect(next.nodes[frameOf(doc).id].w).toBe(192);
    expect(next.nodes.a.x).toBe(16);
    expect(next.nodes.b.x).toBe(126);
  });

  it('补丁改动子层宽度后自动重排，并标记父容器被接管', () => {
    const doc = docWithFrame();
    box(doc, 'a', 100, 40);
    box(doc, 'b', 100, 40, 200);
    const result = applyCommand(doc, { type: 'patch', id: 'a', patch: { w: 160 } });
    expect(result.doc.nodes.a.x).toBe(16);
    expect(result.doc.nodes.b.x).toBe(188);
    expect(result.beforeNodes?.b.x).toBe(200);
    expect(isAutoLayoutChild(result.doc, 'a')).toBe(true);
  });

  it('重排子层顺序后立即按新顺序布局，并可一步撤销', () => {
    const doc = docWithFrame();
    box(doc, 'a', 100, 40);
    box(doc, 'b', 80, 40);
    const result = applyCommand(doc, { type: 'reorder', id: 'b', toIndex: 0 });
    expect(result.doc.nodes[frameOf(doc).id].children[0]).toBe('b');
    expect(result.doc.nodes.b.x).toBe(16);
    expect(result.doc.nodes.a.x).toBe(108);
    expect(result.beforeNodes?.a.x).toBe(0);
  });
});
