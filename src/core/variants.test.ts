import { describe, expect, it } from 'vitest';
import { createDoc } from './doc';
import { applyCommand } from './commands';
import { validateDoc } from './schema';
import { libraryComponents, pageOfNode, variantFacets, variantLabel, variantMatchesFacet, variantOptions } from './variants';
import type { GromaDoc, SceneNode } from './types';

let seq = 0;
const makeId = (type: SceneNode['type']) => `${type}-v${++seq}`;

function componentDoc(): { doc: GromaDoc; first: string; second: string } {
  let doc = createDoc('变体', 500, 300);
  const page = doc.nodes[doc.pages[0].rootId];
  const frame = doc.nodes[page.children[0]];
  const first = frame.id;
  frame.name = '按钮 / 默认';
  frame.w = 160;
  frame.h = 48;
  frame.children = [];
  frame.fills = [{ type: 'solid', color: '#2563EB', opacity: 1 }];
  doc.nodes[frame.id] = frame;

  const label: SceneNode = {
    id: 'label',
    type: 'text',
    name: '文字',
    parentId: frame.id,
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
  frame.children = [label.id];
  doc.nodes[frame.id] = frame;

  const marked = applyCommand(doc, { type: 'patch', id: frame.id, patch: { isComponent: true } });
  doc = marked.doc;

  const second: SceneNode = {
    ...frame,
    id: 'hover',
    name: '按钮 / 悬停',
    x: 220,
    y: 0,
    w: 160,
    h: 52,
    children: [],
    fills: [{ type: 'solid', color: '#1D4ED8', opacity: 1 }],
    isComponent: true,
  };
  doc.nodes[second.id] = second;
  const parent = doc.nodes[page.id];
  doc.nodes[page.id] = { ...parent, children: [...parent.children, second.id] };
  return { doc, first, second: second.id };
}

describe('组件变体一期', () => {
  it('两个主组件合并为变体集，坐标归位且 schema 通过', () => {
    const { doc, first, second } = componentDoc();
    const result = applyCommand(doc, { type: 'create-variant-set', ids: [first, second], makeId });
    const set = result.node as SceneNode;
    expect(set.isVariantSet).toBe(true);
    expect(set.children).toEqual([first, second]);
    expect(set.w).toBe(380);
    expect(set.h).toBe(52);
    const hover = result.doc.nodes[second];
    expect(hover.parentId).toBe(set.id);
    expect(hover.x).toBe(220);
    expect(hover.y).toBe(0);
    expect(hover.variantSetId).toBe(set.id);
    expect(variantLabel(hover)).toBe('变体 2');
    expect(variantOptions(result.doc, set.id)).toHaveLength(2);
    expect(validateDoc(result.doc).ok).toBe(true);
    expect(Object.keys(result.beforeNodes ?? {})).toContain(second);
  });

  it('实例切换变体保留位置并采用目标尺寸和内容', () => {
    const { doc, first, second } = componentDoc();
    const setDoc = applyCommand(doc, { type: 'create-variant-set', ids: [first, second], makeId }).doc;
    const created = applyCommand(setDoc, { type: 'create-instance', id: first, makeId });
    const instance = created.node as SceneNode;
    const switched = applyCommand(created.doc, { type: 'switch-variant', id: instance.id, targetId: second, makeId });
    const next = switched.node as SceneNode;
    expect(next.componentOf).toBe(second);
    expect(next.x).toBe(instance.x);
    expect(next.y).toBe(instance.y);
    expect(next.w).toBe(160);
    expect(next.h).toBe(52);
    expect(validateDoc(switched.doc).ok).toBe(true);
  });

  it('新增变体复制内容并进同一变体集', () => {
    const { doc, first, second } = componentDoc();
    const setDoc = applyCommand(doc, { type: 'create-variant-set', ids: [first, second], makeId }).doc;
    const setId = Object.values(setDoc.nodes).find((node) => node.isVariantSet)?.id as string;
    const added = applyCommand(setDoc, { type: 'add-variant', id: first, makeId });
    const variant = added.node as SceneNode;
    expect(variant.variantSetId).toBe(setId);
    expect(variant.variantProps).toBeTruthy();
    const set = added.doc.nodes[setId];
    expect(set.children).toContain(variant.id);
    expect(validateDoc(added.doc).ok).toBe(true);
  });

  it('schema 拒绝重复变体组合与跨集变体', () => {
    const { doc, first, second } = componentDoc();
    const setDoc = applyCommand(doc, { type: 'create-variant-set', ids: [first, second], makeId }).doc;
    const set = Object.values(setDoc.nodes).find((node) => node.isVariantSet) as SceneNode;
    setDoc.nodes[second].variantProps = { ...setDoc.nodes[first].variantProps };
    let result = validateDoc(setDoc);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected duplicate variants');
    expect(result.errors.join(' ')).toContain('重复变体组合');

    const doc2 = componentDoc();
    const set2 = applyCommand(doc2.doc, { type: 'create-variant-set', ids: [doc2.first, doc2.second], makeId }).doc;
    const broken = { ...set2, nodes: { ...set2.nodes, [doc2.second]: { ...set2.nodes[doc2.second], variantSetId: 'missing' } } };
    result = validateDoc(broken);
    expect(result.ok).toBe(false);
    expect(set.children).toContain(second);
  });

  it('组件库列出主组件与实例数，并能定位所属页面', () => {
    const { doc, first, second } = componentDoc();
    const setDoc = applyCommand(doc, { type: 'create-variant-set', ids: [first, second], makeId }).doc;
    const instance = applyCommand(setDoc, { type: 'create-instance', id: first, makeId }).doc;
    const library = libraryComponents(instance);
    expect(library).toHaveLength(2);
    expect(library.find((item) => item.id === first)?.instanceCount).toBe(1);
    expect(pageOfNode(instance, second)?.id).toBe(instance.pages[0].id);
  });

  it('给变体集追加属性后，所有变体保持同一属性维度', () => {
    const { doc, first, second } = componentDoc();
    const setDoc = applyCommand(doc, { type: 'create-variant-set', ids: [first, second], makeId }).doc;
    const set = Object.values(setDoc.nodes).find((node) => node.isVariantSet) as SceneNode;
    const added = applyCommand(setDoc, { type: 'add-variant-property', setId: set.id, name: '尺寸', value: '默认' });
    expect(added.doc.nodes[first].variantProps).toMatchObject({ 状态: '默认', 尺寸: '默认' });
    expect(added.doc.nodes[second].variantProps).toMatchObject({ 尺寸: '默认' });
    expect(validateDoc(added.doc).ok).toBe(true);
    expect(Object.keys(added.beforeNodes ?? {})).toEqual(expect.arrayContaining([set.id, first, second]));
  });

  it('按属性组合新增变体，落在集外侧并可一次撤销收回', () => {
    const { doc, first, second } = componentDoc();
    const setDoc = applyCommand(doc, { type: 'create-variant-set', ids: [first, second], makeId }).doc;
    const set = Object.values(setDoc.nodes).find((node) => node.isVariantSet) as SceneNode;
    const withProp = applyCommand(setDoc, { type: 'add-variant-property', setId: set.id, name: '尺寸' }).doc;
    const combo = applyCommand(withProp, {
      type: 'create-variant-combo',
      setId: set.id,
      props: { 状态: '默认', 尺寸: '大' },
      sourceId: first,
      makeId,
    });
    const variant = combo.node as SceneNode;
    const nextSet = combo.doc.nodes[set.id];
    expect(variant.variantProps).toEqual({ 状态: '默认', 尺寸: '大' });
    expect(variant.parentId).toBe(set.id);
    expect(variant.x).toBeGreaterThanOrEqual(nextSet.w - variant.w);
    expect(nextSet.children).toContain(variant.id);
    expect(validateDoc(combo.doc).ok).toBe(true);
    expect(combo.undoRemove).toEqual(expect.arrayContaining([variant.id]));
    expect(combo.undoRemove).toHaveLength(2);

    expect(() =>
      applyCommand(combo.doc, {
        type: 'create-variant-combo',
        setId: set.id,
        props: { 状态: '默认', 尺寸: '大' },
        makeId,
      }),
    ).toThrow('重复变体组合');
  });

  it('三属性以上按前两轴外的其余属性生成筛选面', () => {
    const options = [
      { id: 'a', name: 'A', props: { 状态: '默认', 尺寸: '默认', 主题: '浅色' }, w: 100, h: 40 },
      { id: 'b', name: 'B', props: { 状态: '悬停', 尺寸: '默认', 主题: '浅色' }, w: 100, h: 40 },
      { id: 'c', name: 'C', props: { 状态: '默认', 尺寸: '大', 主题: '深色' }, w: 100, h: 40 },
    ];
    const facets = variantFacets(options, ['主题']);
    expect(facets).toHaveLength(2);
    expect(facets.map((facet) => facet.label)).toEqual(['主题：浅色', '主题：深色']);
    expect(facets[0].values).toEqual({ 主题: '浅色' });
  });

  it('筛选面只匹配同一组其余属性值', () => {
    const option = { id: 'a', name: 'A', props: { 状态: '默认', 主题: '浅色' }, w: 100, h: 40 };
    expect(variantMatchesFacet(option, ['主题'], { 主题: '浅色' })).toBe(true);
    expect(variantMatchesFacet(option, ['主题'], { 主题: '深色' })).toBe(false);
    expect(variantMatchesFacet(option, [], {})).toBe(true);
  });
});
