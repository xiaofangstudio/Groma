import { describe, expect, it } from 'vitest';
import { booleanEligibility, booleanPathNode } from './boolean';
import { createDoc } from './doc';
import type { GromaDoc, SceneNode } from './types';

function docWithRects(): { doc: GromaDoc; a: string; b: string; frame: string } {
  const doc = createDoc('布尔测试');
  const frame = doc.nodes[doc.pages[0].rootId].children[0];
  const base = doc.nodes[frame];
  const make = (id: string, x: number, y: number, w: number, h: number): SceneNode => ({
    ...base,
    id,
    type: 'rect',
    name: id,
    parentId: frame,
    children: [],
    x,
    y,
    w,
    h,
    fills: [{ type: 'solid', color: '#D9D9D9', opacity: 1 }],
    strokes: [],
  });
  doc.nodes[frame] = { ...base, children: ['a', 'b'] };
  doc.nodes.a = make('a', 0, 0, 100, 100);
  doc.nodes.b = make('b', 50, 0, 100, 100);
  return { doc, a: 'a', b: 'b', frame };
}

function area(contours: Array<{ anchors: Array<{ x: number; y: number }> }>): number {
  let total = 0;
  for (const contour of contours) {
    const points = contour.anchors;
    let sum = 0;
    for (let index = 0; index < points.length; index += 1) {
      const next = points[(index + 1) % points.length];
      sum += points[index].x * next.y - next.x * points[index].y;
    }
    total += sum / 2;
  }
  return Math.abs(total);
}

describe('布尔路径', () => {
  it('两个重叠矩形并集面积正确并落成一条闭合路径', () => {
    const { doc, a, b } = docWithRects();
    const result = booleanPathNode(doc, [a, b], 'union', 'bool-1');
    expect('node' in result).toBe(true);
    if (!('node' in result)) return;
    expect(result.node.type).toBe('path');
    expect(result.node.pathContours?.length).toBe(1);
    expect(result.node.pathClosed).toBe(true);
    expect(area(result.node.pathContours ?? [])).toBeCloseTo(15000, 0);
    expect(result.node.fills?.[0]).toMatchObject({ type: 'solid', color: '#D9D9D9' });
  });

  it('两个重叠矩形差集面积正确，完全包含时保留内孔', () => {
    const { doc, a, b } = docWithRects();
    const partial = booleanPathNode(doc, [a, b], 'subtract', 'bool-2');
    expect('node' in partial).toBe(true);
    if (!('node' in partial)) return;
    expect(area(partial.node.pathContours ?? [])).toBeCloseTo(5000, 0);
    expect(partial.node.fillRule).toBe('evenodd');

    const contained = docWithRects();
    contained.doc.nodes.b = { ...contained.doc.nodes.b, x: 30, y: 30, w: 40, h: 40 };
    const hole = booleanPathNode(contained.doc, [contained.a, contained.b], 'subtract', 'bool-3');
    expect('node' in hole).toBe(true);
    if (!('node' in hole)) return;
    expect(hole.node.pathContours?.length).toBe(2);
    expect(area(hole.node.pathContours ?? [])).toBeCloseTo(8400, 0);
  });

  it('交集与排除面积正确，并保留 evenodd 闭合路径', () => {
    const { doc, a, b } = docWithRects();
    const intersect = booleanPathNode(doc, [a, b], 'intersect', 'bool-4');
    expect('node' in intersect).toBe(true);
    if (!('node' in intersect)) return;
    expect(area(intersect.node.pathContours ?? [])).toBeCloseTo(5000, 0);
    expect(intersect.node.fillRule).toBe('evenodd');
    expect(intersect.node.name.startsWith('交集 ')).toBe(true);

    const exclude = booleanPathNode(doc, [a, b], 'exclude', 'bool-5');
    expect('node' in exclude).toBe(true);
    if (!('node' in exclude)) return;
    expect(area(exclude.node.pathContours ?? [])).toBeCloseTo(10000, 0);
    expect(exclude.node.name.startsWith('排除 ')).toBe(true);
  });

  it('差集按图层 z-order 取底层减上层，不听选择顺序', () => {
    const { doc, a, b } = docWithRects();
    doc.nodes.b = { ...doc.nodes.b, w: 50 };
    const reversed = booleanPathNode(doc, [b, a], 'subtract', 'bool-6');
    expect('node' in reversed).toBe(true);
    if (!('node' in reversed)) return;
    expect(area(reversed.node.pathContours ?? [])).toBeCloseTo(5000, 0);
    expect(reversed.sourceIds).toEqual([a, b]);
    expect(reversed.node.x).toBeCloseTo(0, 2);
  });

  it('不足两个闭合对象时给出明确原因', () => {
    const { doc, a } = docWithRects();
    expect(booleanEligibility(doc, [a]).ok).toBe(false);
    expect(booleanEligibility(doc, [a]).reason).toContain('正好两个');

    const open = createDoc('开放路径');
    const frame = open.nodes[open.pages[0].rootId].children[0];
    const path: SceneNode = {
      ...open.nodes[frame],
      id: 'open-path',
      type: 'path',
      name: '开放',
      parentId: frame,
      children: [],
      w: 100,
      h: 100,
      fills: [],
      strokes: [],
      pathContours: [{ closed: false, anchors: [{ x: 0, y: 0, inX: 0, inY: 0, outX: 0, outY: 0 }, { x: 80, y: 80, inX: 80, inY: 80, outX: 80, outY: 80 }] }],
    };
    const rect: SceneNode = {
      ...open.nodes[frame],
      id: 'rect-x',
      type: 'rect',
      name: '矩形',
      parentId: frame,
      children: [],
      w: 80,
      h: 80,
      fills: [],
      strokes: [],
    };
    open.nodes[frame] = { ...open.nodes[frame], children: [path.id, rect.id] };
    open.nodes[path.id] = path;
    open.nodes[rect.id] = rect;
    expect(booleanEligibility(open, [path.id, rect.id]).reason).toContain('闭合');
  });
});
