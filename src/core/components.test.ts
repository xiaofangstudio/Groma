import { describe, expect, it } from 'vitest';
import { createDoc } from './doc';
import { applyCommand } from './commands';
import { validateDoc } from './schema';
import type { GromaDoc, SceneNode } from './types';

let seq = 0;
const makeId = (type: SceneNode['type']) => `${type}-c${++seq}`;

function masterDoc(): GromaDoc {
  const doc = createDoc('组件', 500, 300);
  const page = doc.nodes[doc.pages[0].rootId];
  const frame = doc.nodes[page.children[0]];
  frame.name = '按钮组';
  frame.w = 300;
  frame.h = 100;
  frame.children = [];
  frame.fills = [{ type: 'solid', color: '#2563EB', opacity: 1 }];
  for (const [id, x] of [['a', 0], ['b', 90]] as const) {
    const node: SceneNode = {
      id,
      type: 'rect',
      name: id,
      parentId: frame.id,
      children: [],
      x,
      y: 0,
      w: 80,
      h: 40,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      clipContent: false,
      fills: [{ type: 'solid', color: '#F2B705', opacity: 1 }],
      cornerRadius: 8,
    };
    doc.nodes[id] = node;
    frame.children.push(id);
  }
  const marked = applyCommand(doc, { type: 'patch', id: frame.id, patch: { isComponent: true } });
  return marked.doc;
}

describe('组件一期', () => {
  it('主组件可以创建实例，实例带 componentOf 且不再是主组件', () => {
    const doc = masterDoc();
    const master = doc.nodes[Object.values(doc.nodes).find((n) => n.isComponent)?.id as string];
    const result = applyCommand(doc, { type: 'create-instance', id: master.id, makeId });
    const instance = result.node;
    expect(instance).toBeTruthy();
    expect(instance?.componentOf).toBe(master.id);
    expect(instance?.isComponent).toBeUndefined();
    expect(instance?.name).toContain('实例');
    expect(instance?.children.length).toBe(2);
    expect(instance?.children[0]).not.toBe('a');
    expect(result.parentId).toBe(master.parentId);
  });

  it('同步实例会复制主组件的新尺寸/内容，同时保留实例位置', () => {
    const doc = masterDoc();
    const master = doc.nodes[Object.values(doc.nodes).find((n) => n.isComponent)?.id as string];
    const created = applyCommand(doc, { type: 'create-instance', id: master.id, makeId });
    const instance = created.node as SceneNode;
    const movedMaster = applyCommand(created.doc, {
      type: 'patch',
      id: 'a',
      patch: { w: 120, fills: [{ type: 'solid', color: '#EF4444', opacity: 1 }] },
    }).doc;
    const synced = applyCommand(movedMaster, { type: 'sync-instance', id: instance.id, makeId });
    const next = synced.node as SceneNode;
    expect(next.x).toBe(instance.x);
    expect(next.y).toBe(instance.y);
    expect(next.children.length).toBe(2);
    const child = synced.doc.nodes[next.children[0]];
    expect(child.w).toBe(120);
    expect(child.fills[0]?.color).toBe('#EF4444');
    expect(child.id).not.toBe('a');
    expect(synced.beforeNodes && Object.keys(synced.beforeNodes).length).toBeGreaterThan(0);
  });

  it('脱离组件只清 componentOf，保留实例内容', () => {
    const doc = masterDoc();
    const master = doc.nodes[Object.values(doc.nodes).find((n) => n.isComponent)?.id as string];
    const created = applyCommand(doc, { type: 'create-instance', id: master.id, makeId });
    const instance = created.node as SceneNode;
    const detached = applyCommand(created.doc, { type: 'patch', id: instance.id, patch: { componentOf: undefined } });
    expect(detached.doc.nodes[instance.id].componentOf).toBeUndefined();
    expect(detached.doc.nodes[instance.id].children.length).toBe(2);
  });

  it('schema 拒绝非画板主组件与主组件/实例双重身份', () => {
    const doc = masterDoc();
    doc.nodes.a.isComponent = true;
    let result = validateDoc(doc);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected invalid component doc');
    expect(result.errors.join(' ')).toContain('只有画板');

    const doc2 = masterDoc();
    const master = Object.values(doc2.nodes).find((n) => n.isComponent) as SceneNode;
    master.componentOf = master.id;
    result = validateDoc(doc2);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected dual component doc');
    expect(result.errors.join(' ')).toContain('不能同时');
  });
});
