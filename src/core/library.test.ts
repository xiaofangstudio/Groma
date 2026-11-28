import { describe, expect, it } from 'vitest';
import { createDoc } from './doc';
import { applyCommand, importComponentFromDoc, refreshComponentFromDoc } from './commands';
import { validateDoc } from './schema';
import { componentTransferIssues, externalComponents } from './library';
import type { GromaDoc, SceneNode } from './types';

let seq = 0;
const makeId = (type: SceneNode['type']) => `${type}-lib-${++seq}`;

function sourceComponent(): { doc: GromaDoc; rootId: string } {
  let doc = createDoc('来源', 400, 300);
  const page = doc.nodes[doc.pages[0].rootId];
  const frame = doc.nodes[page.children[0]];
  frame.name = '徽章';
  frame.w = 120;
  frame.h = 40;
  frame.fills = [{ type: 'solid', color: '#F2B705', opacity: 1 }];
  frame.children = [];

  const label: SceneNode = {
    id: 'badge-label',
    type: 'text',
    name: '文字',
    parentId: frame.id,
    children: [],
    x: 12,
    y: 10,
    w: 80,
    h: 20,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    clipContent: false,
    fills: [],
    cornerRadius: 0,
    text: '徽章',
    fontSize: 13,
    fontWeight: 500,
    fontFamily: 'Inter',
  };
  doc.nodes[label.id] = label;
  frame.children = [label.id];
  doc.nodes[frame.id] = frame;
  const marked = applyCommand(doc, { type: 'patch', id: frame.id, patch: { isComponent: true } });
  return { doc: marked.doc, rootId: frame.id };
}

describe('跨工程组件库', () => {
  it('普通主组件可迁移，图片资产会阻止导入', () => {
    const source = sourceComponent();
    const page = source.doc.nodes[source.doc.pages[0].rootId];
    const targetPageId = page.id;

    expect(externalComponents(source.doc, 'p', '来源').find((item) => item.id === source.rootId)?.transferable).toBe(
      true,
    );
    source.doc.nodes[source.rootId] = {
      ...source.doc.nodes[source.rootId],
      fills: [],
      assetId: 'a1',
    };
    // 仅主组件根节点带图片资产，也应判成不可迁移。
    const issues = externalComponents(source.doc, 'p', '来源').find((item) => item.id === source.rootId);
    expect(issues?.transferable).toBe(false);
    expect(issues?.issues).toContain('图片资产');
    expect(targetPageId).not.toBe(source.rootId);
  });

  it('导入会换成新 id，并保留字面样式与子层结构', () => {
    const source = sourceComponent();
    const target = createDoc('目标', 600, 400);
    const targetPage = target.nodes[target.pages[0].rootId];
    const result = importComponentFromDoc(
      target,
      source.doc,
      source.rootId,
      makeId,
      targetPage.id,
      80,
      240,
      { projectId: 'p', projectName: '来源', nodeId: source.rootId, nodeName: '徽章' },
    );
    expect(result.node).toBeTruthy();
    const root = result.node as SceneNode;
    expect(root.id).not.toBe(source.rootId);
    expect(root.isComponent).toBe(true);
    expect(root.librarySource?.projectName).toBe('来源');
    expect(root.x).toBe(80);
    expect(root.y).toBe(240);
    expect(root.children).toHaveLength(1);
    const child = result.doc.nodes[root.children[0]];
    expect(child.parentId).toBe(root.id);
    expect(child.text).toBe('徽章');
    expect(child.id).not.toBe('badge-label');
    expect(validateDoc(result.doc).ok).toBe(true);
  });

  it('导入后不会留下外部样式、变量和实例引用', () => {
    const source = sourceComponent();
    const target = createDoc('目标', 600, 400);
    const targetPage = target.nodes[target.pages[0].rootId];
    source.doc.nodes[source.rootId] = {
      ...source.doc.nodes[source.rootId],
      styleRefs: { fill: 'style-external' },
      variableBindings: { fill: 'var-external' },
      componentOf: 'master-external',
    };
    const result = importComponentFromDoc(target, source.doc, source.rootId, makeId, targetPage.id, 0, 0);
    const root = result.node as SceneNode;
    expect(root.styleRefs).toBeUndefined();
    expect(root.variableBindings).toBeUndefined();
    expect(root.componentOf).toBeUndefined();
    expect(validateDoc(result.doc).ok).toBe(true);
  });

  it('从来源更新保留目标 id 和位置，实例链接不断', () => {
    const source = sourceComponent();
    const target = createDoc('目标', 600, 400);
    const targetPage = target.nodes[target.pages[0].rootId];
    const imported = importComponentFromDoc(
      target,
      source.doc,
      source.rootId,
      makeId,
      targetPage.id,
      120,
      220,
      { projectId: 'p', projectName: '来源', nodeId: source.rootId, nodeName: '徽章' },
    );
    const master = imported.node as SceneNode;
    const instance = applyCommand(imported.doc, { type: 'create-instance', id: master.id, makeId });
    expect(instance.node?.componentOf).toBe(master.id);

    source.doc.nodes[source.rootId] = {
      ...source.doc.nodes[source.rootId],
      w: 160,
      fills: [{ type: 'solid', color: '#2563EB', opacity: 1 }],
    };
    source.doc.nodes['badge-label'] = {
      ...source.doc.nodes['badge-label'],
      text: '新版徽章',
      fontSize: 15,
    };
    const refreshed = refreshComponentFromDoc(instance.doc, master.id, source.doc, source.rootId, makeId);
    const nextMaster = refreshed.node as SceneNode;
    expect(nextMaster.id).toBe(master.id);
    expect(nextMaster.x).toBe(120);
    expect(nextMaster.y).toBe(220);
    expect(nextMaster.w).toBe(160);
    expect(refreshed.doc.nodes['badge-label']).toBeUndefined();
    const child = refreshed.doc.nodes[nextMaster.children[0]];
    expect(child.text).toBe('新版徽章');
    expect(child.fontSize).toBe(15);
    const instanceNode = refreshed.doc.nodes[instance.node!.id];
    expect(instanceNode.componentOf).toBe(master.id);
    expect(validateDoc(refreshed.doc).ok).toBe(true);
  });

  it('来源组件带外部依赖时会被识别，更新时也会剥掉', () => {
    const source = sourceComponent();
    source.doc.nodes[source.rootId] = { ...source.doc.nodes[source.rootId], assetId: 'photo' };
    const target = createDoc('目标', 600, 400);
    const targetPage = target.nodes[target.pages[0].rootId];
    const imported = importComponentFromDoc(
      target,
      source.doc,
      source.rootId,
      makeId,
      targetPage.id,
      0,
      0,
      { projectId: 'p', projectName: '来源', nodeId: source.rootId, nodeName: '徽章' },
    );
    const master = imported.node as SceneNode;
    expect(componentTransferIssues(source.doc, source.rootId)).toContain('图片资产');
    const refreshed = refreshComponentFromDoc(imported.doc, master.id, source.doc, source.rootId, makeId);
    expect((refreshed.node as SceneNode).assetId).toBeUndefined();
    expect(validateDoc(refreshed.doc).ok).toBe(true);
  });
});
