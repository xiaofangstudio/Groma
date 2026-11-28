import { describe, expect, it } from 'vitest';
import { createDoc } from './doc';
import { applyCommand } from './commands';
import { validateDoc } from './schema';
import { ancestorInstance, applyInstanceOverrides, instancePath } from './instance';
import type { GromaDoc, SceneNode } from './types';

let seq = 0;
const makeId = (type: SceneNode['type']) => `${type}-i${++seq}`;

function instanceDoc(): { doc: GromaDoc; master: string; instance: string } {
  let doc = createDoc('实例覆盖', 500, 300);
  const page = doc.nodes[doc.pages[0].rootId];
  const master = doc.nodes[page.children[0]];
  master.name = '按钮';
  master.w = 160;
  master.h = 48;
  master.children = [];
  master.fills = [{ type: 'solid', color: '#2563EB', opacity: 1 }];
  const label: SceneNode = {
    id: 'label',
    type: 'text',
    name: '文字',
    parentId: master.id,
    children: [],
    x: 20,
    y: 14,
    w: 120,
    h: 20,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    clipContent: false,
    fills: [],
    cornerRadius: 0,
    text: '按钮',
    fontSize: 14,
    fontWeight: 400,
    fontFamily: 'Inter',
  };
  doc.nodes[label.id] = label;
  doc.nodes[master.id] = { ...master, children: [label.id] };
  doc = applyCommand(doc, { type: 'patch', id: master.id, patch: { isComponent: true } }).doc;
  const created = applyCommand(doc, { type: 'create-instance', id: master.id, makeId });
  if (!created.node) throw new Error('实例创建失败');
  return { doc: created.doc, master: master.id, instance: created.node.id };
}

describe('实例覆盖', () => {
  it('能找到实例根与子层路径', () => {
    const { doc, instance } = instanceDoc();
    const childId = doc.nodes[instance].children[0];
    expect(ancestorInstance(doc, childId)?.id).toBe(instance);
    expect(instancePath(doc, instance, childId)).toBe('0');
    expect(ancestorInstance(doc, instance)).toBeNull();
  });

  it('同步主组件后保留文字覆盖', () => {
    const { doc, master, instance } = instanceDoc();
    const childId = doc.nodes[instance].children[0];
    let next: GromaDoc = {
      ...doc,
      nodes: { ...doc.nodes, [instance]: { ...doc.nodes[instance], instanceOverrides: { '0': { text: '已覆盖' } } } },
    };
    next = applyCommand(next, { type: 'patch', id: master, patch: { w: 180 } }).doc;
    const sync = applyCommand(next, { type: 'sync-instance', id: instance, makeId });
    const syncedChild = sync.doc.nodes[instance].children[0];
    expect(sync.doc.nodes[syncedChild].text).toBe('已覆盖');
    expect(sync.doc.nodes[syncedChild].id).not.toBe(childId);
  });

  it('去掉覆盖后同步恢复主组件内容', () => {
    const { doc, master, instance } = instanceDoc();
    let next: GromaDoc = {
      ...doc,
      nodes: { ...doc.nodes, [instance]: { ...doc.nodes[instance], instanceOverrides: { '0': { text: '已覆盖' } } } },
    };
    next = applyCommand(next, { type: 'patch', id: master, patch: { text: undefined } }).doc;
    next.nodes['label'] = { ...next.nodes['label'], text: '主组件文字' };
    next = applyCommand(next, { type: 'patch', id: instance, patch: { instanceOverrides: undefined } }).doc;
    const sync = applyCommand(next, { type: 'sync-instance', id: instance, makeId });
    const child = sync.doc.nodes[instance].children[0];
    expect(sync.doc.nodes[child].text).toBe('主组件文字');
  });

  it('覆盖按路径应用到正确图层', () => {
    const { doc, instance } = instanceDoc();
    const patched = applyInstanceOverrides({ ...doc, nodes: { ...doc.nodes, [instance]: { ...doc.nodes[instance], instanceOverrides: { '0': { text: 'A', fontSize: 18 } } } } }, instance);
    const child = patched.nodes[instance].children[0];
    expect(patched.nodes[child].text).toBe('A');
    expect(patched.nodes[child].fontSize).toBe(18);
  });

  it('替换组件保留同路径同名覆盖', () => {
    const { doc, master, instance } = instanceDoc();
    const page = doc.nodes[doc.pages[0].rootId];
    const sourceChild = doc.nodes[doc.nodes[master].children[0]];
    const nextChild = { ...sourceChild, id: 'label-b', parentId: 'master-b', name: '文字', text: '次要' };
    const second = {
      ...doc.nodes[master],
      id: 'master-b',
      name: '次要按钮',
      x: 280,
      children: ['label-b'],
      fills: [{ type: 'solid' as const, color: '#F2B705', opacity: 1 }],
    };
    const next: GromaDoc = {
      ...doc,
      nodes: {
        ...doc.nodes,
        'master-b': second,
        'label-b': nextChild,
        [instance]: { ...doc.nodes[instance], instanceOverrides: { '0': { text: '实例覆盖' } } },
        [page.id]: { ...page, children: [...page.children, 'master-b'] },
      },
    };
    const swapped = applyCommand(next, { type: 'swap-instance', id: instance, targetId: 'master-b', makeId });
    const root = swapped.doc.nodes[instance];
    expect(root.componentOf).toBe('master-b');
    expect(root.w).toBe(second.w);
    const child = swapped.doc.nodes[root.children[0]];
    expect(child.text).toBe('实例覆盖');
    expect(root.instanceOverrides?.['0']?.text).toBe('实例覆盖');
  });

  it('替换组件时结构不同则丢掉旧覆盖', () => {
    const { doc, master, instance } = instanceDoc();
    const page = doc.nodes[doc.pages[0].rootId];
    const sourceChild = doc.nodes[doc.nodes[master].children[0]];
    const nextChild = { ...sourceChild, id: 'label-c', parentId: 'master-c', name: '图标' };
    const third = { ...doc.nodes[master], id: 'master-c', name: '图标按钮', children: ['label-c'] };
    const next: GromaDoc = {
      ...doc,
      nodes: {
        ...doc.nodes,
        'master-c': third,
        'label-c': nextChild,
        [instance]: { ...doc.nodes[instance], instanceOverrides: { '0': { text: '实例覆盖' } } },
        [page.id]: { ...page, children: [...page.children, 'master-c'] },
      },
    };
    const swapped = applyCommand(next, { type: 'swap-instance', id: instance, targetId: 'master-c', makeId });
    const root = swapped.doc.nodes[instance];
    expect(root.componentOf).toBe('master-c');
    expect(root.instanceOverrides).toBeUndefined();
    const child = swapped.doc.nodes[root.children[0]];
    expect(child.text).not.toBe('实例覆盖');
  });

  it('schema 拒绝非实例携带覆盖与非法路径', () => {
    const { doc, instance } = instanceDoc();
    const onMaster = { ...doc, nodes: { ...doc.nodes, [doc.nodes[instance].children[0]]: { ...doc.nodes[doc.nodes[instance].children[0]], instanceOverrides: { '0': { text: 'x' } } } } };
    expect(validateDoc(onMaster).ok).toBe(false);
    const badPath = { ...doc, nodes: { ...doc.nodes, [instance]: { ...doc.nodes[instance], instanceOverrides: { 'a.b': { text: 'x' } } } } };
    expect(validateDoc(badPath).ok).toBe(false);
    const good = { ...doc, nodes: { ...doc.nodes, [instance]: { ...doc.nodes[instance], instanceOverrides: { '0': { text: 'x' } } } } };
    expect(validateDoc(good).ok).toBe(true);
    const roundtrip = validateDoc(JSON.parse(JSON.stringify(good)));
    expect(roundtrip.ok).toBe(true);
    if (roundtrip.ok) {
      expect(roundtrip.doc.nodes[instance].instanceOverrides?.['0']?.text).toBe('x');
    }
  });
});
