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

  it('子层主轴 Fill 吃掉剩余空间，固定项保持原宽', () => {
    const doc = docWithFrame();
    const a = box(doc, 'a', 100, 40);
    box(doc, 'b', 80, 40);
    a.layoutGrow = true;
    frameOf(doc).layout = { ...defaultAutoLayout(), gap: 10 };
    const next = reflowPageFrom(doc, 'a');
    expect(next.nodes.a.w).toBe(278);
    expect(next.nodes.b.x).toBe(304);
    expect(next.nodes.b.w).toBe(80);
  });

  it('子层交叉轴 Fill 拉满父容器内高', () => {
    const doc = docWithFrame();
    const a = box(doc, 'a', 100, 40);
    a.layoutAlignSelf = 'stretch';
    frameOf(doc).layout = { ...defaultAutoLayout(), gap: 10, align: 'center' };
    const next = reflowPageFrom(doc, 'a');
    expect(next.nodes.a.h).toBe(168);
    expect(next.nodes.a.y).toBe(16);
  });

  it('父级适应主轴时忽略 Fill，按开启 Fill 前的固定宽度收缩', () => {
    const doc = docWithFrame();
    const a = box(doc, 'a', 210, 40);
    box(doc, 'b', 50, 40);
    a.layoutGrow = true;
    a.layoutBaseW = 150;
    frameOf(doc).layout = {
      ...defaultAutoLayout(),
      gap: 10,
      hug: false,
      hugWidth: true,
      hugHeight: false,
    };
    const next = reflowPageFrom(doc, 'a');
    expect(next.nodes[frameOf(doc).id].w).toBe(242);
    expect(next.nodes.a.w).toBe(150);
    expect(next.nodes.b.x).toBe(176);
  });

  it('父级适应交叉轴时忽略交叉 Fill，按开启 Fill 前的高度收缩', () => {
    const doc = docWithFrame();
    const a = box(doc, 'a', 100, 104);
    a.layoutAlignSelf = 'stretch';
    a.layoutBaseH = 40;
    frameOf(doc).layout = {
      ...defaultAutoLayout(),
      gap: 10,
      hug: false,
      hugWidth: false,
      hugHeight: true,
    };
    const next = reflowPageFrom(doc, 'a');
    expect(next.nodes[frameOf(doc).id].h).toBe(72);
    expect(next.nodes.a.h).toBe(40);
  });

  it('宽高分别 Hug 时同时包住主内容和交叉轴最高子层', () => {
    const doc = docWithFrame();
    box(doc, 'a', 100, 40);
    box(doc, 'b', 50, 80);
    frameOf(doc).layout = {
      ...defaultAutoLayout(),
      gap: 10,
      hug: false,
      hugWidth: true,
      hugHeight: true,
    };
    const next = reflowPageFrom(doc, 'a');
    const frame = next.nodes[frameOf(doc).id];
    expect(frame.w).toBe(192);
    expect(frame.h).toBe(112);
    expect(next.nodes.a.y).toBe(16);
    expect(next.nodes.b.y).toBe(16);
  });

  it('嵌套容器被父级 Fill 拉伸后，内部子层再回流', () => {
    const doc = docWithFrame();
    const outer = frameOf(doc);
    const fixed = box(doc, 'fixed', 80, 40);
    const inner: SceneNode = {
      id: 'inner',
      type: 'frame',
      name: 'inner',
      parentId: outer.id,
      children: ['inner-child'],
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      clipContent: false,
      fills: [],
      cornerRadius: 0,
      layout: { ...defaultAutoLayout(), mode: 'vertical' },
      layoutGrow: true,
    };
    const child: SceneNode = {
      ...inner,
      id: 'inner-child',
      type: 'rect',
      name: 'inner-child',
      parentId: 'inner',
      children: [],
      w: 40,
      h: 20,
      layout: undefined,
      layoutGrow: undefined,
      layoutAlignSelf: 'stretch',
    };
    doc.nodes.inner = inner;
    doc.nodes['inner-child'] = child;
    outer.children = ['inner', fixed.id];
    const next = reflowPageFrom(doc, 'inner');
    expect(next.nodes.inner.w).toBe(276);
    expect(next.nodes['inner-child'].w).toBe(244);
    expect(next.nodes.fixed.x).toBe(304);
  });

  it('插入 / 删除 / 恢复子层都立即重排，不靠手动按钮', () => {
    const doc = docWithFrame();
    const frame = frameOf(doc);
    box(doc, 'a', 100, 40);
    box(doc, 'b', 80, 40);
    frame.layout = { ...defaultAutoLayout(), gap: 10 };
    const c: SceneNode = {
      id: 'c',
      type: 'rect',
      name: 'c',
      parentId: frame.id,
      children: [],
      x: 0,
      y: 0,
      w: 50,
      h: 40,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      clipContent: false,
      fills: [],
      cornerRadius: 0,
    };
    const added = applyCommand(doc, { type: 'insert', parentId: frame.id, node: c });
    expect(added.doc.nodes.a.x).toBe(16);
    expect(added.doc.nodes.b.x).toBe(126);
    expect(added.doc.nodes.c.x).toBe(216);

    const removed = applyCommand(added.doc, { type: 'remove', id: 'b' });
    expect(removed.doc.nodes.a.x).toBe(16);
    expect(removed.doc.nodes.c.x).toBe(126);

    const restored = applyCommand(removed.doc, {
      type: 'restore',
      parentId: frame.id,
      index: removed.index ?? 1,
      subtree: { b: added.doc.nodes.b },
    });
    expect(restored.doc.nodes.b.x).toBe(126);
    expect(restored.doc.nodes.c.x).toBe(216);
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
