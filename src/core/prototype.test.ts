import { describe, expect, it } from 'vitest';
import { createDoc } from './doc';
import { nearestFrame, prototypeHotspots, prototypeStart, topLevelFrames } from './prototype';
import { validateDoc } from './schema';
import type { GromaDoc, SceneNode } from './types';

function frame(id: string, name: string, parentId: string, x: number): SceneNode {
  return {
    id,
    type: 'frame',
    name,
    parentId,
    children: [],
    x,
    y: 0,
    w: 400,
    h: 300,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    clipContent: true,
    fills: [{ type: 'solid', color: '#FFFFFF', opacity: 1 }],
    cornerRadius: 0,
  };
}

function prototypeDoc(): GromaDoc {
  const doc = createDoc('原型', 900, 600);
  const page = doc.pages[0];
  const root = doc.nodes[page.rootId];
  root.children = ['frame-a', 'frame-b'];
  doc.nodes['frame-a'] = frame('frame-a', '首页', root.id, 0);
  doc.nodes['frame-b'] = frame('frame-b', '详情', root.id, 460);
  const button: SceneNode = {
    id: 'button',
    type: 'rect',
    name: '进入详情',
    parentId: 'frame-a',
    children: [],
    x: 40,
    y: 60,
    w: 160,
    h: 52,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    clipContent: false,
    fills: [{ type: 'solid', color: '#2563EB', opacity: 1 }],
    cornerRadius: 12,
    prototype: { targetId: 'frame-b', trigger: 'click' },
  };
  doc.nodes.button = button;
  doc.nodes['frame-a'].children = ['button'];
  return doc;
}

describe('原型一期', () => {
  it('列出页内顶层画板并支持从选区向上找画板', () => {
    const doc = prototypeDoc();
    expect(topLevelFrames(doc, doc.pages[0]).map((node) => node.name)).toEqual(['首页', '详情']);
    expect(nearestFrame(doc, 'button')?.id).toBe('frame-a');
    expect(prototypeStart(doc, doc.pages[0], 'button')?.id).toBe('frame-a');
  });

  it('热区坐标换算到画板本地', () => {
    const doc = prototypeDoc();
    const hotspots = prototypeHotspots(doc, 'frame-a');
    expect(hotspots).toHaveLength(1);
    expect(hotspots[0].targetId).toBe('frame-b');
    expect(hotspots[0].rect).toEqual({ x: 40, y: 60, w: 160, h: 52 });
  });

  it('schema 拒绝空目标和非法触发', () => {
    const doc = prototypeDoc();
    doc.nodes.button.prototype = { targetId: '' };
    const result = validateDoc(doc);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected invalid prototype');
    expect(result.errors.join(' ')).toContain('原型目标');

    doc.nodes.button.prototype = { targetId: 'frame-b', trigger: 'hover' as 'click' };
    const result2 = validateDoc(doc);
    expect(result2.ok).toBe(false);
    if (result2.ok) throw new Error('expected invalid trigger');
    expect(result2.errors.join(' ')).toContain('只支持 click');
  });
});
