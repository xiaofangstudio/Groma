import { describe, expect, it } from 'vitest';
import { createDoc } from './doc';
import { validateDoc } from './schema';
import type { GromaDoc, SceneNode } from './types';

function brokenDoc(): GromaDoc {
  return structuredClone(createDoc('校验测试'));
}

function firstError(value: unknown): string {
  const result = validateDoc(value);
  return result.ok ? '' : result.errors.join(' / ');
}

describe('场景校验', () => {
  it('新建场景通过结构级校验', () => {
    const result = validateDoc(createDoc('正常'));
    expect(result.ok).toBe(true);
  });

  it('接受页级手动参考线并拒绝非法参考线', () => {
    const doc = brokenDoc();
    doc.pages[0].guides = [
      { axis: 'x', position: 120 },
      { axis: 'y', position: 240 },
    ];
    expect(validateDoc(doc).ok).toBe(true);

    const bad = brokenDoc();
    bad.pages[0].guides = [{ axis: 'y', position: Number.NaN }];
    expect(firstError(bad)).toContain('页结构非法');
  });

  it('拒绝不存在的子节点引用', () => {
    const doc = brokenDoc();
    const root = doc.nodes[doc.pages[0].rootId];
    root.children.push('ghost');
    expect(firstError(doc)).toContain('不存在的子节点');
  });

  it('拒绝父子关系不一致', () => {
    const doc = brokenDoc();
    const root = doc.nodes[doc.pages[0].rootId];
    const frame = doc.nodes[root.children[0]];
    frame.parentId = null;
    expect(firstError(doc)).toContain('parentId 与父节点');
  });

  it('拒绝环', () => {
    const doc = brokenDoc();
    const root = doc.nodes[doc.pages[0].rootId];
    const a: SceneNode = { ...doc.nodes[root.children[0]], id: 'a', parentId: root.id, children: [] };
    const b: SceneNode = { ...a, id: 'b', parentId: 'a', children: ['a'] };
    a.children = ['b'];
    root.children = ['a'];
    doc.nodes.a = a;
    doc.nodes.b = b;
    expect(firstError(doc)).toContain('存在环');
  });

  it('拒绝同一节点挂两个父节点', () => {
    const doc = brokenDoc();
    const root = doc.nodes[doc.pages[0].rootId];
    const frame = doc.nodes[root.children[0]];
    root.children.push(frame.id, frame.id);
    expect(firstError(doc)).toContain('children 有重复 id');
  });

  it('拒绝非法数值和文本必填字段', () => {
    const doc = brokenDoc();
    const root = doc.nodes[doc.pages[0].rootId];
    const frame = doc.nodes[root.children[0]];
    frame.opacity = 2;
    frame.w = -1;
    const text = { ...frame, id: 'text-x', type: 'text' as const, parentId: frame.id, children: [] };
    frame.children = ['text-x'];
    doc.nodes['text-x'] = text;
    const error = firstError(doc);
    expect(error).toContain('透明度');
    expect(error).toContain('宽度');
    expect(error).toContain('缺少 text');
  });

  it('拒绝保留键与孤儿节点', () => {
    const doc = brokenDoc();
    const root = doc.nodes[doc.pages[0].rootId];
    const frame = doc.nodes[root.children[0]];
    const orphan = { ...frame, id: 'orphan', parentId: root.id, children: [] };
    frame.children = [];
    doc.nodes.orphan = orphan;
    Object.defineProperty(doc.nodes, '__proto__', { value: frame, enumerable: true, configurable: true });
    const error = firstError(doc);
    expect(error).toContain('保留键');
    expect(error).toContain('不可从任何页面根节点到达');
  });
});
