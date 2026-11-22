import { describe, expect, it } from 'vitest';
import { applyCommand, collectSubtree } from './commands';
import { createDoc } from './doc';
import type { SceneNode } from './types';

function rootId(doc: ReturnType<typeof createDoc>): string {
  return doc.pages[0].rootId;
}

function rect(id: string, parentId: string, x = 0, y = 0): SceneNode {
  return {
    id,
    type: 'rect',
    name: id,
    parentId,
    children: [],
    x,
    y,
    w: 100,
    h: 80,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    clipContent: false,
    fills: [{ type: 'solid', color: '#D9D9D9', opacity: 1 }],
    cornerRadius: 0,
  };
}

describe('场景命令层', () => {
  it('insert 不改原文档，并正确挂到父节点', () => {
    const doc = createDoc('命令测试');
    const parent = rootId(doc);
    const node = rect('r1', parent, 10, 20);
    const before = doc.nodes[parent].children.length;
    const result = applyCommand(doc, { type: 'insert', parentId: parent, node });

    expect(doc.nodes[parent].children.length).toBe(before);
    expect(result.doc.nodes[parent].children.length).toBe(before + 1);
    expect(result.doc.nodes[parent].children.at(-1)).toBe('r1');
    expect(result.index).toBe(before);
    expect(result.doc.nodes.r1).toEqual(node);
  });

  it('patch 只改表现字段，结构字段不能穿透', () => {
    const doc = createDoc('命令测试');
    const parent = rootId(doc);
    const node = rect('r1', parent);
    const inserted = applyCommand(doc, { type: 'insert', parentId: parent, node }).doc;
    const result = applyCommand(inserted, {
      type: 'patch',
      id: 'r1',
      patch: { x: 30, name: '改名', parentId: 'hacked', children: ['evil'], type: 'frame' } as never,
    });

    expect(result.after?.x).toBe(30);
    expect(result.after?.name).toBe('改名');
    expect(result.after?.parentId).toBe(parent);
    expect(result.after?.children).toEqual([]);
    expect(result.after?.type).toBe('rect');
    expect(result.doc.nodes[parent].children).toContain('r1');
  });

  it('remove 返回完整子树，restore 按原索引放回', () => {
    const doc = createDoc('命令测试');
    const parent = rootId(doc);
    const a = rect('a', parent);
    const b = rect('b', parent);
    const child = rect('child', 'a');
    let current = applyCommand(doc, { type: 'insert', parentId: parent, node: a }).doc;
    current = applyCommand(current, { type: 'insert', parentId: parent, node: b }).doc;
    current = applyCommand(current, { type: 'insert', parentId: 'a', node: child }).doc;

    const expectedIndex = current.nodes[parent].children.indexOf('a');
    const removed = applyCommand(current, { type: 'remove', id: 'a' });
    expect(removed.doc.nodes.a).toBeUndefined();
    expect(removed.doc.nodes.child).toBeUndefined();
    expect(removed.index).toBe(expectedIndex);
    expect(Object.keys(removed.subtree ?? {}).sort()).toEqual(['a', 'child']);

    const restored = applyCommand(removed.doc, {
      type: 'restore',
      parentId: parent,
      index: removed.index ?? 0,
      subtree: removed.subtree ?? {},
    });
    expect(restored.doc.nodes.a).toBeTruthy();
    expect(restored.doc.nodes.child.parentId).toBe('a');
    expect(restored.doc.nodes[parent].children).toEqual(current.nodes[parent].children);
  });

  it('clone 子树会重映射父子 id，并只偏移根节点', () => {
    const doc = createDoc('命令测试');
    const parent = rootId(doc);
    const frame: SceneNode = { ...rect('frame-src', parent, 40, 60), type: 'frame', children: [] };
    let current = applyCommand(doc, { type: 'insert', parentId: parent, node: frame }).doc;
    const child = rect('child-src', 'frame-src');
    current = applyCommand(current, { type: 'insert', parentId: 'frame-src', node: child }).doc;

    let seq = 0;
    const makeId = (type: string) => `${type}-clone-${++seq}`;
    const result = applyCommand(current, {
      type: 'clone',
      id: 'frame-src',
      makeId,
      dx: 12,
      dy: 12,
      nameSuffix: ' 副本',
    });

    const clone = result.node as SceneNode;
    const cloneChild = result.doc.nodes[clone.children[0]];
    expect(clone.type).toBe('frame');
    expect(clone.name).toBe('frame-src 副本');
    expect(clone.x).toBe(52);
    expect(clone.y).toBe(72);
    expect(cloneChild.type).toBe('rect');
    expect(cloneChild.parentId).toBe(clone.id);
    expect(cloneChild.x).toBe(0);
    expect(cloneChild.y).toBe(0);
    expect(result.subtree && Object.keys(result.subtree).length).toBe(2);
    expect(Object.keys(collectSubtree(result.doc, clone.id)).length).toBe(2);
  });

  it('delete 页面根节点会被拒绝', () => {
    const doc = createDoc('命令测试');
    expect(() => applyCommand(doc, { type: 'remove', id: rootId(doc) })).toThrow('不能删除页面根节点');
  });

  it('group 保持原有上下顺序，并插到最高选中图层的层级', () => {
    const doc = createDoc('命令测试');
    const frameId = doc.nodes[rootId(doc)].children[0];
    let current = applyCommand(doc, { type: 'insert', parentId: frameId, node: rect('a', frameId, 0, 0) }).doc;
    current = applyCommand(current, { type: 'insert', parentId: frameId, node: rect('b', frameId, 50, 0) }).doc;
    current = applyCommand(current, { type: 'insert', parentId: frameId, node: rect('c', frameId, 100, 0) }).doc;

    let seq = 0;
    const result = applyCommand(current, {
      type: 'group',
      ids: ['c', 'a'],
      makeId: (type) => `${type}-${++seq}`,
    });
    const groupId = result.node?.id as string;
    expect(result.doc.nodes[frameId].children).toEqual(['b', groupId]);
    expect(result.doc.nodes[groupId].children).toEqual(['a', 'c']);
    expect(result.doc.nodes.a.parentId).toBe(groupId);
    expect(result.doc.nodes.c.parentId).toBe(groupId);
    expect(result.beforeNodes?.a.x).toBe(0);
    expect(result.afterNodes?.a.x).toBe(0);
    expect(result.afterNodes?.c.x).toBe(100);

    const ungrouped = applyCommand(result.doc, { type: 'ungroup', id: groupId });
    expect(ungrouped.doc.nodes[groupId]).toBeUndefined();
    expect(ungrouped.doc.nodes[frameId].children).toEqual(['b', 'a', 'c']);
    expect(ungrouped.doc.nodes.a.x).toBe(0);
    expect(ungrouped.doc.nodes.c.x).toBe(100);
  });
});
