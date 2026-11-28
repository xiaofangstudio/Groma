import { describe, expect, it } from 'vitest';
import { createDoc } from './doc';
import { validateDoc } from './schema';
import { activeModeId, canAliasVariable, materializeVariables, variableById, variableDependsOnCollection, variableValue } from './variables';
import type { GromaDoc, VariableCollection } from './types';

function themedDoc(): GromaDoc {
  const doc = createDoc('变量', 400, 300);
  const modeA = 'mode-a';
  const modeB = 'mode-b';
  const collection: VariableCollection = {
    id: 'theme',
    name: '主题',
    modes: [
      { id: modeA, name: '浅色' },
      { id: modeB, name: '深色' },
    ],
    defaultModeId: modeA,
    variables: {
      'color-primary': {
        id: 'color-primary',
        name: '主色',
        type: 'color',
        collectionId: 'theme',
        values: { [modeA]: '#2563EB', [modeB]: '#F2B705' },
      },
      'radius-card': {
        id: 'radius-card',
        name: '卡片圆角',
        type: 'number',
        collectionId: 'theme',
        values: { [modeA]: 8, [modeB]: 18 },
      },
    },
  };
  const frameId = doc.nodes[doc.pages[0].rootId].children[0];
  return {
    ...doc,
    variables: { theme: collection },
    variableModes: { theme: modeA },
    nodes: {
      ...doc.nodes,
      [frameId]: {
        ...doc.nodes[frameId],
        variableBindings: { fill: 'color-primary', cornerRadius: 'radius-card' },
      },
    },
  };
}

function aliasDoc(): GromaDoc {
  const doc = themedDoc();
  doc.variables = {
    ...(doc.variables ?? {}),
    semantic: {
      id: 'semantic',
      name: '语义',
      modes: [{ id: 'sem-a', name: '默认' }],
      defaultModeId: 'sem-a',
      variables: {
        'color-alias': {
          id: 'color-alias',
          name: '品牌色引用',
          type: 'color',
          collectionId: 'semantic',
          values: { 'sem-a': '#000000' },
          alias: 'color-primary',
        },
      },
    },
  };
  doc.variableModes = { ...(doc.variableModes ?? {}), semantic: 'sem-a' };
  return doc;
}

describe('Variables 与多 Mode 一期', () => {
  it('读取当前 Mode 值并按绑定刷新填充与圆角', () => {
    const doc = themedDoc();
    const collection = doc.variables?.theme as VariableCollection;
    expect(activeModeId(doc, collection)).toBe('mode-a');
    expect(variableValue(doc, 'color-primary')).toBe('#2563EB');
    const next = materializeVariables({ ...doc, variableModes: { theme: 'mode-b' } }, 'theme');
    const frameId = doc.nodes[doc.pages[0].rootId].children[0];
    const frame = next.doc.nodes[frameId];
    expect(frame.fills[0]?.type).toBe('solid');
    expect(frame.fills[0]?.color).toBe('#F2B705');
    expect(frame.cornerRadius).toBe(18);
    expect(next.beforeNodes[frameId]).toBeTruthy();
    expect(validateDoc(next.doc).ok).toBe(true);
  });

  it('描边颜色、描边宽、间距与内边距同批物化', () => {
    const doc = themedDoc();
    const frameId = doc.nodes[doc.pages[0].rootId].children[0];
    const frame = {
      ...doc.nodes[frameId],
      strokes: [{ color: '#111111', opacity: 1, width: 1, dash: [], cap: 'butt' as const, join: 'miter' as const }],
      layout: {
        mode: 'vertical' as const,
        gap: 8,
        padding: { top: 10, right: 10, bottom: 10, left: 10 },
        align: 'start' as const,
        justify: 'start' as const,
        hug: false,
      },
      variableBindings: { stroke: 'color-primary', strokeWidth: 'radius-card', gap: 'radius-card', padding: 'radius-card' },
    };
    const next = materializeVariables(
      { ...doc, nodes: { ...doc.nodes, [frameId]: frame }, variableModes: { theme: 'mode-b' } },
      'theme',
    );
    const after = next.doc.nodes[frameId];
    expect(after.strokes?.[0].color).toBe('#F2B705');
    expect(after.strokes?.[0].width).toBe(18);
    expect(after.layout?.gap).toBe(18);
    expect(after.layout?.padding).toEqual({ top: 18, right: 18, bottom: 18, left: 18 });
    expect(validateDoc(next.doc).ok).toBe(true);
  });

  it('schema 拒绝无效 Mode、类型错配与失效绑定', () => {
    const doc = themedDoc();
    const broken = {
      ...doc,
      variableModes: { theme: 'missing' },
    };
    let result = validateDoc(broken);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected invalid mode');
    expect(result.errors.join(' ')).toContain('无效 Mode');

    const doc2 = themedDoc();
    const collection = doc2.variables?.theme as VariableCollection;
    collection.variables['color-primary'].values['mode-b'] = 7;
    result = validateDoc(doc2);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected bad color value');

    const doc3 = themedDoc();
    const frameId = doc3.nodes[doc3.pages[0].rootId].children[0];
    doc3.nodes[frameId].variableBindings = { fill: 'radius-card' };
    result = validateDoc(doc3);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected bad binding');
    expect(result.errors.join(' ')).toContain('颜色类型');
  });

  it('未知变量返回 null', () => {
    const doc = themedDoc();
    expect(variableById(doc, 'nope')).toBeNull();
    expect(variableValue(doc, 'nope')).toBeNull();
  });

  it('变量引用解析目标当前 Mode 并沿链刷新', () => {
    const doc = aliasDoc();
    expect(variableValue(doc, 'color-alias')).toBe('#2563EB');
    const themed = { ...doc, variableModes: { ...(doc.variableModes ?? {}), theme: 'mode-b' } };
    expect(variableValue(themed, 'color-alias')).toBe('#F2B705');
    expect(variableDependsOnCollection(themed, 'color-alias', 'theme')).toBe(true);
    const frameId = doc.nodes[doc.pages[0].rootId].children[0];
    const bound = {
      ...themed,
      nodes: {
        ...themed.nodes,
        [frameId]: {
          ...themed.nodes[frameId],
          variableBindings: { fill: 'color-alias' },
          fills: [{ type: 'solid' as const, color: '#2563EB', opacity: 1 }],
        },
      },
    };
    const next = materializeVariables(bound, 'theme');
    expect(next.doc.nodes[frameId].fills[0]?.color).toBe('#F2B705');
    expect(validateDoc(next.doc).ok).toBe(true);
  });

  it('拒绝跨类型引用与循环引用', () => {
    const doc = aliasDoc();
    const alias = doc.variables?.semantic?.variables['color-alias'];
    expect(alias && canAliasVariable(doc, alias.id, 'color-primary')).toBe(true);
    expect(canAliasVariable(doc, 'color-primary', 'color-alias')).toBe(false);
    if (!alias) throw new Error('missing alias');
    alias.alias = 'radius-card';
    let result = validateDoc(doc);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected type alias error');
    expect(result.errors.join(' ')).toContain('同类型');

    const cyclic = aliasDoc();
    const color = cyclic.variables?.theme?.variables['color-primary'];
    if (!color) throw new Error('missing color');
    color.alias = 'color-alias';
    result = validateDoc(cyclic);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected cycle error');
    expect(result.errors.join(' ')).toContain('循环引用');
  });
});
