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

  it('接受区块节点并校验其容器字段', () => {
    const doc = brokenDoc();
    const root = doc.nodes[doc.pages[0].rootId];
    const section: SceneNode = {
      ...doc.nodes[root.children[0]],
      id: 'section-x',
      type: 'section',
      name: '区块 1',
      parentId: root.id,
      children: [],
      fills: [],
      clipContent: false,
    };
    root.children.push('section-x');
    doc.nodes['section-x'] = section;
    expect(validateDoc(doc).ok).toBe(true);

    section.children = ['ghost'];
    expect(firstError(doc)).toContain('不存在的子节点');
  });

  it('接受切片节点并拒绝其非法几何', () => {
    const doc = brokenDoc();
    const root = doc.nodes[doc.pages[0].rootId];
    const frame = doc.nodes[root.children[0]];
    const slice: SceneNode = {
      ...frame,
      id: 'slice-x',
      type: 'slice',
      name: '切片 1',
      parentId: frame.id,
      children: [],
      fills: [],
      clipContent: false,
    };
    frame.children = ['slice-x'];
    doc.nodes['slice-x'] = slice;
    expect(validateDoc(doc).ok).toBe(true);

    slice.w = Number.NaN;
    expect(firstError(doc)).toContain('w 不是有限数字');
  });

  it('接受钢笔锚点并拒绝非法手柄或残缺锚点', () => {
    const doc = brokenDoc();
    const root = doc.nodes[doc.pages[0].rootId];
    const frame = doc.nodes[root.children[0]];
    const pen: SceneNode = {
      ...frame,
      id: 'pen-x',
      type: 'path',
      name: '钢笔 1',
      parentId: frame.id,
      children: [],
      fills: [],
      pathData: 'M 0 0 L 80 0 L 80 60 Z',
      pathW: 80,
      pathH: 60,
      pathClosed: true,
      pathAnchors: [
        { x: 0, y: 0, inX: 0, inY: 0, outX: 0, outY: 0 },
        { x: 80, y: 0, inX: 80, inY: 0, outX: 80, outY: 0 },
        { x: 80, y: 60, inX: 80, inY: 60, outX: 80, outY: 60 },
      ],
      strokes: [],
    };
    frame.children = ['pen-x'];
    doc.nodes['pen-x'] = pen;
    expect(validateDoc(doc).ok).toBe(true);

    pen.pathContours = [
      {
        closed: true,
        anchors: [
          { x: 0, y: 0, inX: 0, inY: 0, outX: 0, outY: 0 },
          { x: 80, y: 0, inX: 80, inY: 0, outX: 80, outY: 0 },
        ],
      },
      {
        closed: false,
        anchors: [
          { x: 20, y: 70, inX: 20, inY: 70, outX: 20, outY: 70 },
          { x: 60, y: 90, inX: 60, inY: 90, outX: 60, outY: 90 },
        ],
      },
    ];
    expect(validateDoc(doc).ok).toBe(true);

    pen.pathContours[0].anchors[0].vertexId = 'v-shared';
    pen.pathContours[1].anchors[0].vertexId = 'v-shared';
    expect(validateDoc(doc).ok).toBe(true);
    pen.pathContours[1].anchors[0].vertexId = '';
    expect(firstError(doc)).toContain('pathContours');
    pen.pathContours[1].anchors[0].vertexId = 'v-shared';

    pen.pathContours = [{ closed: true, anchors: [{ x: 0, y: 0, inX: 0, inY: 0, outX: 0, outY: 0 }] }];
    expect(firstError(doc)).toContain('pathContours');

    pen.pathContours = undefined;
    pen.pathAnchors = [{ x: 0, y: 0, inX: 0, inY: 0, outX: 0, outY: 0 }];
    expect(firstError(doc)).toContain('至少两个合法锚点');

    pen.pathAnchors = [
      { x: 0, y: 0, inX: 0, inY: 0, outX: 0, outY: 0 },
      { x: 80, y: 0, inX: Number.NaN, inY: 0, outX: 80, outY: 0 },
    ];
    expect(firstError(doc)).toContain('至少两个合法锚点');
  });

  it('接受图片节点与资产表，拒绝缺失资产', () => {
    const doc = brokenDoc();
    const root = doc.nodes[doc.pages[0].rootId];
    const frame = doc.nodes[root.children[0]];
    doc.assets = {
      'asset-1': {
        id: 'asset-1',
        name: '照片.png',
        mime: 'image/png',
        file: 'assets/照片.png',
        w: 640,
        h: 480,
        bytes: 1200,
      },
    };
    const image: SceneNode = {
      ...frame,
      id: 'image-1',
      type: 'image',
      name: '照片',
      parentId: frame.id,
      children: [],
      fills: [],
      assetId: 'asset-1',
    };
    frame.children = ['image-1'];
    doc.nodes['image-1'] = image;
    expect(validateDoc(doc).ok).toBe(true);

    image.imageCrop = { x: 0.2, y: 0.1, w: 0.5, h: 0.5 };
    expect(validateDoc(doc).ok).toBe(true);
    image.imageCrop = { x: 0.6, y: 0.1, w: 0.5, h: 0.5 };
    expect(firstError(doc)).toContain('imageCrop');
    image.imageCrop = { x: 0, y: 0, w: 0, h: 1 };
    expect(firstError(doc)).toContain('imageCrop');

    delete doc.assets;
    expect(firstError(doc)).toContain('不存在的资产');
  });

  it('拒绝非法资产路径与格式', () => {
    const doc = brokenDoc();
    doc.assets = {
      bad: {
        id: 'bad',
        name: '坏图',
        mime: 'image/gif',
        file: '../evil.png',
        w: 10,
        h: 10,
        bytes: 10,
      },
    };
    expect(firstError(doc)).toContain('资产 bad 结构非法');
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

  it('文本字距允许负值但拒绝越界', () => {
    const doc = brokenDoc();
    const root = doc.nodes[doc.pages[0].rootId];
    const source = doc.nodes[root.children[0]];
    const text: SceneNode = {
      ...source,
      id: 'text-spacing',
      type: 'text',
      name: '字距',
      parentId: source.id,
      children: [],
      text: 'Spacing',
      fontSize: 24,
      fontWeight: 600,
      letterSpacing: -2,
    };
    doc.nodes[text.id] = text;
    source.children = [text.id];
    expect(validateDoc(doc).ok).toBe(true);
    text.letterSpacing = 201;
    expect(firstError(doc)).toContain('letterSpacing');
  });

  it('形状图片填充校验资产、模式与焦点', () => {
    const doc = brokenDoc();
    const root = doc.nodes[doc.pages[0].rootId];
    const source = doc.nodes[root.children[0]];
    doc.assets = {
      'asset-x': { id: 'asset-x', name: 'x.png', mime: 'image/png', file: 'assets/x.png', w: 100, h: 100, bytes: 1 },
    };
    const shape: SceneNode = {
      ...source,
      id: 'rect-fill',
      type: 'rect',
      name: '图片填充',
      parentId: source.id,
      children: [],
      fills: [{ type: 'solid', color: '#D9D9D9', opacity: 1 }],
      imageFill: { assetId: 'asset-x', mode: 'fill', focusX: 0.5, focusY: 0.5, opacity: 1 },
    };
    doc.nodes[shape.id] = shape;
    source.children = [shape.id];
    expect(validateDoc(doc).ok).toBe(true);
    shape.imageFill = { ...shape.imageFill!, assetId: 'missing' };
    expect(firstError(doc)).toContain('imageFill');
  });

  it('文本列表与段距合法，非法列表值被拒绝', () => {
    const doc = brokenDoc();
    const root = doc.nodes[doc.pages[0].rootId];
    const source = doc.nodes[root.children[0]];
    const text: SceneNode = {
      ...source,
      id: 'text-list',
      type: 'text',
      name: '列表',
      parentId: source.id,
      children: [],
      text: '一\n二',
      fontSize: 24,
      fontWeight: 500,
      listStyle: 'number',
      paragraphSpacing: 12,
    };
    doc.nodes[text.id] = text;
    source.children = [text.id];
    expect(validateDoc(doc).ok).toBe(true);
    text.listStyle = 'square' as SceneNode['listStyle'];
    expect(firstError(doc)).toContain('listStyle');
  });

  it('接受参数化多边形与星形并拒绝越界参数', () => {
    const doc = brokenDoc();
    const root = doc.nodes[doc.pages[0].rootId];
    const source = doc.nodes[root.children[0]];
    const shape: SceneNode = {
      ...source,
      id: 'shape-x',
      type: 'path',
      name: '多边形 1',
      parentId: root.id,
      children: [],
      pathData: 'M 0 0 L 10 0 L 5 10 Z',
      shapeKind: 'polygon',
      shapeSides: 5,
      fills: [{ type: 'solid', color: '#D9D9D9', opacity: 1 }],
    };
    root.children = [...root.children, 'shape-x'];
    doc.nodes['shape-x'] = shape;
    expect(firstError(doc)).toBe('');

    shape.shapeSides = 13;
    expect(firstError(doc)).toContain('shapeSides');
    shape.shapeSides = 5;
    shape.shapeKind = 'star';
    shape.shapeInnerRatio = 0.05;
    expect(firstError(doc)).toContain('shapeInnerRatio');
  });

  it('接受箭头线身与三角头并拒绝空头部路径', () => {
    const doc = brokenDoc();
    const root = doc.nodes[doc.pages[0].rootId];
    const source = doc.nodes[root.children[0]];
    const arrow: SceneNode = {
      ...source,
      id: 'arrow-x',
      type: 'path',
      name: '箭头 1',
      parentId: root.id,
      children: [],
      pathData: 'M 0 21 L 160 21',
      shapeKind: 'arrow',
      arrowHeadData: 'M 145 1 L 160 21 L 145 41 Z',
      fills: [],
      strokes: [{ color: '#221C00', opacity: 1, width: 2, dash: [], cap: 'butt', join: 'miter' }],
    };
    root.children = [...root.children, 'arrow-x'];
    doc.nodes['arrow-x'] = arrow;
    expect(firstError(doc)).toBe('');
    arrow.arrowHeadData = '';
    expect(firstError(doc)).toContain('arrowHeadData');
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

  it('校验形状蒙版的父级与类型，允许删除上层后的惰性蒙版', () => {
    const doc = brokenDoc();
    const root = doc.nodes[doc.pages[0].rootId];
    const frame = doc.nodes[root.children[0]];
    const mask: SceneNode = {
      ...frame,
      id: 'mask-x',
      type: 'rect',
      name: '蒙版',
      parentId: frame.id,
      children: [],
      x: 20,
      y: 20,
      w: 100,
      h: 100,
      isMask: true,
      fills: [],
    };
    const top: SceneNode = { ...mask, id: 'top-x', name: '上层', isMask: undefined, x: 0, y: 0, w: 300, h: 300 };
    frame.children = ['mask-x', 'top-x'];
    doc.nodes['mask-x'] = mask;
    doc.nodes['top-x'] = top;
    expect(firstError(doc)).toBe('');

    frame.children = ['top-x', 'mask-x'];
    expect(firstError(doc)).toBe('');

    frame.children = ['mask-x', 'top-x', 'mask-y'];
    doc.nodes['mask-y'] = { ...mask, id: 'mask-y' };
    expect(firstError(doc)).toBe('');

    frame.children = ['mask-x', 'top-x'];
    doc.nodes['mask-x'] = { ...mask, type: 'text', isMask: true };
    expect(firstError(doc)).toContain('必须是矩形、椭圆或钢笔路径');

    doc.nodes['mask-x'] = { ...mask, maskType: 'soft' as never };
    expect(firstError(doc)).toContain('maskType');
  });
});
