import { describe, expect, it } from 'vitest';
import { childrenOf, createDoc } from './doc';

describe('createDoc', () => {
  it('新建工程包含一页、一个根节点和一个 1440×900 画板', () => {
    const doc = createDoc('测试工程');
    expect(doc.version).toBe(1);
    expect(doc.name).toBe('测试工程');
    expect(doc.pages).toHaveLength(1);

    const page = doc.pages[0];
    const root = doc.nodes[page.rootId];
    expect(root.type).toBe('page');

    const frames = childrenOf(doc, root.id);
    expect(frames).toHaveLength(1);
    expect(frames[0].type).toBe('frame');
    expect(frames[0].w).toBe(1440);
    expect(frames[0].h).toBe(900);
    expect(frames[0].fills[0].color).toBe('#FFFFFF');
    expect(frames[0].parentId).toBe(root.id);
  });

  it('可以创建指定尺寸与名称的画板', () => {
    const doc = createDoc('手机稿', 390, 844, '手机 390');
    const page = doc.pages[0];
    const frame = doc.nodes[page.rootId].children.map((id) => doc.nodes[id])[0];
    expect(frame.w).toBe(390);
    expect(frame.h).toBe(844);
    expect(frame.name).toBe('手机 390');
  });

  it('尺寸会被夹到可用范围', () => {
    const doc = createDoc('夹取', 0, 99999);
    const page = doc.pages[0];
    const frame = doc.nodes[page.rootId].children.map((id) => doc.nodes[id])[0];
    expect(frame.w).toBe(1);
    expect(frame.h).toBe(16384);
  });

  it('每个节点 id 唯一且 children 与 parentId 对应', () => {
    const doc = createDoc();
    const ids = Object.keys(doc.nodes);
    expect(new Set(ids).size).toBe(ids.length);

    for (const node of Object.values(doc.nodes)) {
      for (const childId of node.children) {
        expect(doc.nodes[childId].parentId).toBe(node.id);
      }
    }
  });
});
