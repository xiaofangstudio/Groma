import { describe, expect, it } from 'vitest';
import { createDoc } from './doc';
import { diffDocs, diffSummary } from './diff';
import type { SceneNode } from './types';

function rect(id: string, name: string, parentId: string, x = 0): SceneNode {
  return {
    id,
    type: 'rect',
    name,
    parentId,
    children: [],
    x,
    y: 0,
    w: 100,
    h: 80,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    clipContent: false,
    fills: [{ type: 'solid', color: '#0EA5E9', opacity: 1 }],
    cornerRadius: 0,
  };
}

function docWith(children: SceneNode[]): { doc: ReturnType<typeof createDoc>; frameId: string } {
  const doc = createDoc('差异', 400, 300);
  const frame = doc.nodes[doc.pages[0].rootId].children[0];
  for (const node of children) doc.nodes[node.id] = node;
  doc.nodes[frame].children = children.map((node) => node.id);
  return { doc, frameId: frame };
}

describe('版本差异', () => {
  it('统计节点新增、删除与属性变更', () => {
    const { doc: before, frameId } = docWith([
      rect('keep', '保持', 'frame'),
      rect('removed', '删除', 'frame'),
      rect('changed', '变更', 'frame'),
    ]);
    const after = structuredClone(before);
    delete after.nodes.removed;
    after.nodes.changed.x = 88;
    after.nodes.added = rect('added', '新增', frameId, 120);
    after.nodes[frameId].children = ['keep', 'changed', 'added'];

    const diff = diffDocs(before, after);
    expect(diff.added).toBe(1);
    expect(diff.removed).toBe(1);
    expect(diff.changed).toBe(2);
    expect(diff.identical).toBe(false);
    expect(diffSummary(diff)).toBe('+1 / -1 / ~2');
    expect(diff.addedNames).toEqual(['新增']);
    expect(diff.removedNames).toEqual(['删除']);
    expect(diff.changedNames).toContain('变更');
  });

  it('相同文档判定一致', () => {
    const doc = createDoc('一致', 400, 300);
    expect(diffDocs(doc, structuredClone(doc)).identical).toBe(true);
    expect(diffSummary(diffDocs(doc, doc))).toBe('与当前一致');
  });

  it('孩子顺序变化算变更', () => {
    const { doc: before, frameId } = docWith([rect('a', 'A', 'frame'), rect('b', 'B', 'frame', 20)]);
    const after = structuredClone(before);
    after.nodes[frameId].children = ['b', 'a'];
    expect(diffDocs(before, after).changed).toBe(1);
  });
});
