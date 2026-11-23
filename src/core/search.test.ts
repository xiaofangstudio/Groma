import { describe, expect, it } from 'vitest';
import { applyCommand } from './commands';
import { createDoc } from './doc';
import { addPage } from './pages';
import { searchPageNodes } from './search';
import type { SceneNode } from './types';

function idFactory() {
  let seq = 0;
  return () => {
    seq += 1;
    return `test-${seq}`;
  };
}

function node(id: string, type: SceneNode['type'], name: string, parentId: string, children: string[] = []): SceneNode {
  return {
    id,
    type,
    name,
    parentId,
    children,
    x: 0,
    y: 0,
    w: 100,
    h: 80,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    clipContent: false,
    fills: [],
    cornerRadius: 0,
  };
}

describe('跨页面图层搜索', () => {
  it('空查询返回空，不扫描工程', () => {
    const doc = createDoc('测试');
    expect(searchPageNodes(doc, '')).toEqual([]);
    expect(searchPageNodes(doc, '   ')).toEqual([]);
  });

  it('跨页命中、忽略大小写，结果带页名和父级路径', () => {
    const doc = createDoc('测试', 1440, 900, '桌面 1440');
    const makeId = idFactory();
    const second = addPage(doc, makeId, '第二页');
    const firstRoot = second.doc.nodes[second.doc.pages[0].rootId];
    const frameId = firstRoot.children[0];
    const nestedId = 'nested-header';
    let next = applyCommand(second.doc, {
      type: 'insert',
      parentId: frameId,
      node: node(nestedId, 'text', 'Header Title', frameId),
    }).doc;
    next = applyCommand(next, {
      type: 'insert',
      parentId: second.page.rootId,
      node: node('second-header', 'rect', 'header copy', second.page.rootId),
    }).doc;

    const hits = searchPageNodes(next, 'HEADER');
    expect(hits).toHaveLength(2);
    expect(hits[0]).toMatchObject({
      pageId: doc.pages[0].id,
      pageName: '页面 1',
      nodeId: nestedId,
      nodeName: 'Header Title',
      nodeType: 'text',
      path: '桌面 1440',
    });
    expect(hits[1]).toMatchObject({
      pageId: second.page.id,
      pageName: '第二页',
      nodeId: 'second-header',
      path: '顶层',
    });
  });

  it('搜索不返回页面根节点，顶层节点路径为“顶层”', () => {
    const doc = createDoc('测试');
    const hits = searchPageNodes(doc, '页面');
    expect(hits).toEqual([]);
    expect(searchPageNodes(doc, '桌面')[0]?.path).toBe('顶层');
  });

  it('结果按页面顺序和文档顺序截断到上限', () => {
    const doc = createDoc('测试', 1440, 900, 'One');
    const makeId = idFactory();
    const second = addPage(doc, makeId, 'Two');
    const firstRoot = second.doc.nodes[second.doc.pages[0].rootId];
    const frameId = firstRoot.children[0];
    let next = applyCommand(second.doc, {
      type: 'insert',
      parentId: frameId,
      node: node('a-card', 'rect', 'Card A', frameId),
    }).doc;
    next = applyCommand(next, {
      type: 'insert',
      parentId: frameId,
      node: node('b-card', 'rect', 'Card B', frameId),
    }).doc;
    next = applyCommand(next, {
      type: 'insert',
      parentId: second.page.rootId,
      node: node('c-card', 'rect', 'Card C', second.page.rootId),
    }).doc;

    const hits = searchPageNodes(next, 'card', 2);
    expect(hits.map((hit) => hit.nodeId)).toEqual(['a-card', 'b-card']);
    expect(searchPageNodes(next, 'card', 0)).toHaveLength(1);
  });
});
