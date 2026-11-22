import { describe, expect, it } from 'vitest';
import { createDoc } from './doc';
import { addPage, duplicatePage, movePage, nextPageName, pageContainsNode, removePage, renamePage } from './pages';

function idFactory() {
  let seq = 0;
  return (type = 'id') => `test-${type}-${(seq += 1)}`;
}

describe('页面纯函数', () => {
  it('新建页面会生成独立页面根节点，并自动避开已占用页名', () => {
    const doc = createDoc('测试');
    const makeId = idFactory();
    const result = addPage(doc, makeId);
    expect(result.page.name).toBe('页面 2');
    expect(result.doc.pages.map((page) => page.name)).toEqual(['页面 1', '页面 2']);
    const root = result.doc.nodes[result.page.rootId];
    expect(root.type).toBe('page');
    expect(root.parentId).toBeNull();
    expect(root.children).toEqual([]);
    expect(result.page.background).toBe('#E9E8E4');
    expect(nextPageName(result.doc)).toBe('页面 3');
  });

  it('改名同步页面名与根节点名，空名和同名不产生变更', () => {
    const doc = createDoc('测试');
    const page = doc.pages[0];
    const renamed = renamePage(doc, page.id, '  首页  ');
    expect(renamed?.pages[0].name).toBe('首页');
    expect(renamed?.nodes[page.rootId].name).toBe('首页');
    expect(renamePage(doc, page.id, '   ')).toBeNull();
    expect(renamePage(doc, page.id, '页面 1')).toBeNull();
  });

  it('复制页面会深克隆整棵页面树，并插在源页后面', () => {
    const doc = createDoc('测试');
    doc.pages[0].guides = [{ axis: 'x', position: 120 }];
    const root = doc.nodes[doc.pages[0].rootId];
    const frame = doc.nodes[root.children[0]];
    const makeId = idFactory();

    const result = duplicatePage(doc, doc.pages[0].id, makeId);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.doc.pages).toHaveLength(2);
    expect(result.doc.pages[1].id).toBe(result.page.id);
    expect(result.page.name).toBe('页面 1 副本');
    expect(result.page.guides).toEqual([{ axis: 'x', position: 120 }]);
    expect(result.page.guides).not.toBe(doc.pages[0].guides);

    const cloneRoot = result.doc.nodes[result.page.rootId];
    expect(cloneRoot.children).toHaveLength(1);
    const cloneFrameId = cloneRoot.children[0];
    expect(cloneFrameId).not.toBe(frame.id);
    expect(result.doc.nodes[cloneFrameId].parentId).toBe(cloneRoot.id);
    expect(result.doc.nodes[cloneFrameId].w).toBe(frame.w);
    expect(result.doc.nodes[frame.id].parentId).toBe(root.id);
    expect(result.doc.nodes[cloneFrameId]).not.toBe(result.doc.nodes[frame.id]);
  });

  it('删除页面会连同整棵子树移除，并返回相邻页；最后一页不能删', () => {
    const doc = createDoc('测试');
    const makeId = idFactory();
    const second = addPage(doc, makeId);
    const result = removePage(second.doc, second.page.id);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.doc.pages).toHaveLength(1);
    expect(result.nextPageId).toBe(result.doc.pages[0].id);
    expect(result.doc.nodes[second.page.rootId]).toBeUndefined();
    expect(removePage(result.doc, result.doc.pages[0].id)).toBeNull();
  });

  it('能判断节点归属哪一页，跨页节点返回 false', () => {
    const doc = createDoc('测试');
    const makeId = idFactory();
    const second = addPage(doc, makeId);
    const firstRoot = doc.nodes[doc.pages[0].rootId];
    const firstFrame = doc.nodes[firstRoot.children[0]];
    expect(pageContainsNode(doc, doc.pages[0].id, firstFrame.id)).toBe(true);
    expect(pageContainsNode(second.doc, second.page.id, firstFrame.id)).toBe(false);
    expect(pageContainsNode(second.doc, second.page.id, 'missing')).toBe(false);
  });

  it('移动页面只改 pages 顺序，越界和原位返回 null', () => {
    const doc = createDoc('测试');
    const makeId = idFactory();
    const second = addPage(doc, makeId);
    const third = addPage(second.doc, makeId);
    const beforeRoots = third.doc.pages.map((page) => page.rootId);

    const moved = movePage(third.doc, third.page.id, 0);
    expect(moved).not.toBeNull();
    if (!moved) return;
    expect(moved.pages.map((page) => page.name)).toEqual(['页面 3', '页面 1', '页面 2']);
    expect(moved.pages.map((page) => page.rootId)).toEqual([third.page.rootId, beforeRoots[0], beforeRoots[1]]);
    expect(moved.nodes).toBe(third.doc.nodes);
    expect(movePage(third.doc, third.page.id, 2)).toBeNull();
    expect(movePage(third.doc, third.page.id, 3)).toBeNull();
  });
});
