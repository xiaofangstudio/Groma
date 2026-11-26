import { describe, expect, it } from 'vitest';
import { createDoc } from '../core/doc';
import { polygonPath, starPath } from '../core/shapes';
import type { SceneNode } from '../core/types';
import { registerImageAsset } from '../io/images';
import { renderFrameSvg, renderNodeSvg, renderSliceSvg } from './svg';

function rectNode(id: string, parentId: string): SceneNode {
  return {
    id,
    type: 'rect',
    name: '红色矩形',
    parentId,
    children: [],
    x: 20,
    y: 30,
    w: 80,
    h: 60,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    clipContent: false,
    fills: [{ type: 'solid', color: '#FF0000', opacity: 1 }],
    cornerRadius: 6,
  };
}

describe('SVG 导出', () => {
  it('按目标画板归零坐标并输出形状和尺寸', () => {
    const doc = createDoc('SVG 测试', 400, 300);
    const page = doc.pages[0];
    const frameId = doc.nodes[page.rootId].children[0];
    doc.nodes['rect-a'] = rectNode('rect-a', frameId);
    doc.nodes[frameId].children = ['rect-a'];

    const result = renderFrameSvg(doc, frameId, false, 1);
    expect(result).not.toBeNull();
    expect(result?.width).toBe(400);
    expect(result?.height).toBe(300);
    expect(result?.svg).toContain('viewBox="0 0 400 300"');
    expect(result?.svg).toContain('x="20" y="30" width="80" height="60"');
    expect(result?.svg).toContain('fill="#FF0000"');
    expect(result?.svg).toContain('rx="6"');
  });

  it('投影与整层模糊输出 SVG filter，并按节点包裹', () => {
    const doc = createDoc('SVG 效果', 400, 300);
    const page = doc.pages[0];
    const frameId = doc.nodes[page.rootId].children[0];
    const node = rectNode('rect-effect', frameId);
    node.effects = [
      { type: 'drop-shadow', x: 0, y: 8, blur: 16, color: '#221C00', opacity: 0.25, visible: true },
      { type: 'layer-blur', blur: 6, visible: true },
    ];
    doc.nodes[node.id] = node;
    doc.nodes[frameId].children = [node.id];
    const result = renderFrameSvg(doc, frameId, false, 1);
    expect(result?.svg).toContain('<filter id="groma-effect-1"');
    expect(result?.svg).toContain('feDropShadow in="eff-base" dx="0" dy="8" stdDeviation="8" flood-color="#221C00" flood-opacity="0.25"');
    expect(result?.svg).toContain('feGaussianBlur in="SourceGraphic" stdDeviation="3" result="eff-main"');
    expect(result?.svg).toContain('<g filter="url(#groma-effect-1)"><rect');
  });

  it('透明背景不会补白底，文本内容按 XML 转义', () => {
    const doc = createDoc('SVG 透明', 200, 120);
    const page = doc.pages[0];
    const frameId = doc.nodes[page.rootId].children[0];
    doc.nodes['text-a'] = {
      ...rectNode('text-a', frameId),
      type: 'text',
      name: '文本',
      text: 'A < B & C',
      fontSize: 18,
      fontWeight: 600,
      fills: [{ type: 'solid', color: '#221C00', opacity: 1 }],
    };
    doc.nodes[frameId].children = ['text-a'];

    const result = renderFrameSvg(doc, frameId, true, 1);
    expect(result?.svg).not.toContain('width="200" height="120" fill="#FFFFFF"');
    expect(result?.svg).toContain('A &lt; B &amp; C');
    expect(result?.svg).toContain('<text');
  });

  it('数字列表与段距输出前缀和累计 dy', () => {
    const doc = createDoc('SVG 列表', 200, 120);
    const page = doc.pages[0];
    const frameId = doc.nodes[page.rootId].children[0];
    doc.nodes['text-list'] = {
      ...rectNode('text-list', frameId),
      type: 'text',
      name: '列表',
      x: 20,
      y: 30,
      w: 140,
      h: 80,
      text: '第一行\n第二行',
      fontSize: 18,
      fontWeight: 500,
      lineHeight: 1.3,
      paragraphSpacing: 10,
      listStyle: 'number',
    };
    doc.nodes[frameId].children = ['text-list'];
    const result = renderFrameSvg(doc, frameId, false, 1);
    expect(result?.svg).toContain('1.  第一行');
    expect(result?.svg).toContain('2.  第二行');
    expect(result?.svg).toContain('dy="33.4"');
  });

  it('居中文本按文本框中心输出 SVG 锚点', () => {
    const doc = createDoc('SVG 居中', 200, 120);
    const page = doc.pages[0];
    const frameId = doc.nodes[page.rootId].children[0];
    doc.nodes['text-center'] = {
      ...rectNode('text-center', frameId),
      type: 'text',
      name: '居中标题',
      x: 20,
      y: 30,
      w: 100,
      h: 40,
      text: '居中',
      fontSize: 18,
      fontWeight: 600,
      align: 'center',
      letterSpacing: 2,
      fills: [{ type: 'solid', color: '#221C00', opacity: 1 }],
    };
    doc.nodes[frameId].children = ['text-center'];
    const result = renderFrameSvg(doc, frameId, false, 1);
    expect(result?.svg).toContain('x="70"');
    expect(result?.svg).toContain('<tspan x="70">居中</tspan>');
    expect(result?.svg).toContain('text-anchor="middle"');
    expect(result?.svg).toContain('letter-spacing="2"');
  });

  it('图片节点把资产内嵌为 SVG image，圆角走 clipPath', async () => {
    const doc = createDoc('SVG 图片', 200, 120);
    const page = doc.pages[0];
    const frameId = doc.nodes[page.rootId].children[0];
    const dataUrl = 'data:image/png;base64,AAAA';
    const asset = {
      id: 'asset-1',
      name: '图片.png',
      mime: 'image/png',
      file: 'assets/图片.png',
      w: 200,
      h: 120,
      bytes: 3,
    };
    doc.assets = { 'asset-1': asset };
    await registerImageAsset(asset, dataUrl);
    doc.nodes['image-a'] = {
      ...rectNode('image-a', frameId),
      type: 'image',
      name: '图片',
      x: 0,
      y: 0,
      w: 200,
      h: 120,
      fills: [],
      cornerRadius: 8,
      assetId: 'asset-1',
    };
    doc.nodes[frameId].children = ['image-a'];

    const result = renderFrameSvg(doc, frameId, false, 1);
    expect(result?.svg).toContain('<image');
    expect(result?.svg).toContain('href="data:image/png;base64,AAAA"');
    expect(result?.svg).toContain('groma-image-clip');
  });

  it('形状图片填充输出 clipPath 与放大后的 image', async () => {
    const doc = createDoc('SVG 图片填充', 200, 120);
    const page = doc.pages[0];
    const frameId = doc.nodes[page.rootId].children[0];
    const dataUrl = 'data:image/png;base64,BBBB';
    const asset = {
      id: 'asset-fill',
      name: '填充.png',
      mime: 'image/png',
      file: 'assets/填充.png',
      w: 400,
      h: 200,
      bytes: 3,
    };
    doc.assets = { 'asset-fill': asset };
    await registerImageAsset(asset, dataUrl);
    doc.nodes['rect-fill'] = {
      ...rectNode('rect-fill', frameId),
      x: 20,
      y: 20,
      w: 100,
      h: 100,
      fills: [{ type: 'solid', color: '#D9D9D9', opacity: 1 }],
      imageFill: { assetId: 'asset-fill', mode: 'fill', focusX: 0.5, focusY: 0.5, opacity: 1 },
    };
    doc.nodes[frameId].children = ['rect-fill'];

    const result = renderFrameSvg(doc, frameId, false, 1);
    expect(result?.svg).toContain('groma-image-fill-');
    expect(result?.svg).toContain('href="data:image/png;base64,BBBB"');
    expect(result?.svg).toContain('<clipPath');
    expect(result?.svg).toContain('width="200" height="100"');
  });

  it('图片裁剪用嵌套 SVG 只截取源图区域', async () => {
    const doc = createDoc('SVG 裁剪', 200, 120);
    const page = doc.pages[0];
    const frameId = doc.nodes[page.rootId].children[0];
    const dataUrl = 'data:image/png;base64,BBBB';
    const asset = {
      id: 'asset-crop',
      name: '裁剪.png',
      mime: 'image/png',
      file: 'assets/裁剪.png',
      w: 400,
      h: 240,
      bytes: 3,
    };
    doc.assets = { 'asset-crop': asset };
    await registerImageAsset(asset, dataUrl);
    doc.nodes['image-crop'] = {
      ...rectNode('image-crop', frameId),
      type: 'image',
      name: '裁剪图片',
      x: 0,
      y: 0,
      w: 200,
      h: 120,
      fills: [],
      cornerRadius: 0,
      assetId: 'asset-crop',
      imageCrop: { x: 0.25, y: 0.5, w: 0.5, h: 0.5 },
    };
    doc.nodes[frameId].children = ['image-crop'];

    const result = renderFrameSvg(doc, frameId, true, 1);
    expect(result?.svg).toContain('groma-image-crop-');
    expect(result?.svg).toContain('x="-100" y="-120" width="400" height="240"');
    expect(result?.svg).toContain('href="data:image/png;base64,BBBB"');
    expect(result?.svg).toContain('clip-path="url(#groma-image-crop-');
  });

  it('参数化多边形与星形导出为带填充的闭合路径', () => {
    const doc = createDoc('SVG 形状', 400, 300);
    const page = doc.pages[0];
    const frameId = doc.nodes[page.rootId].children[0];
    doc.nodes['polygon-a'] = {
      ...rectNode('polygon-a', frameId),
      type: 'path',
      name: '多边形 1',
      pathData: polygonPath(120, 100, 6),
      shapeKind: 'polygon',
      shapeSides: 6,
      fills: [{ type: 'solid', color: '#D9D9D9', opacity: 1 }],
    };
    doc.nodes['star-a'] = {
      ...rectNode('star-a', frameId),
      type: 'path',
      name: '星形 1',
      x: 160,
      pathData: starPath(120, 100, 5, 0.55),
      shapeKind: 'star',
      shapeSides: 5,
      shapeInnerRatio: 0.55,
      fills: [{ type: 'solid', color: '#112233', opacity: 1 }],
    };
    doc.nodes[frameId].children = ['polygon-a', 'star-a'];

    const result = renderFrameSvg(doc, frameId, false, 1);
    expect(result?.svg.match(/<path /g)?.length).toBe(2);
    expect(result?.svg).toContain('fill="#D9D9D9"');
    expect(result?.svg).toContain('fill="#112233"');
    expect(result?.svg).toContain('fill-rule="nonzero"');
  });

  it('箭头导出线身与用描边色填充的三角头', () => {
    const doc = createDoc('SVG 箭头', 400, 300);
    const page = doc.pages[0];
    const frameId = doc.nodes[page.rootId].children[0];
    doc.nodes['arrow-a'] = {
      ...rectNode('arrow-a', frameId),
      type: 'path',
      name: '箭头 1',
      x: 0,
      y: 0,
      w: 160,
      h: 42,
      pathData: 'M 0 21 L 160 21',
      pathW: 160,
      pathH: 42,
      shapeKind: 'arrow',
      arrowHeadData: 'M 145 1 L 160 21 L 145 41 Z',
      fills: [],
      strokes: [{ color: '#221C00', opacity: 1, width: 2, dash: [], cap: 'butt', join: 'miter' }],
    };
    doc.nodes[frameId].children = ['arrow-a'];

    const result = renderFrameSvg(doc, frameId, false, 1);
    expect(result?.svg.match(/<path /g)?.length).toBe(2);
    expect(result?.svg).toContain('stroke="#221C00"');
    expect(result?.svg).toContain('d="M 145 1 L 160 21 L 145 41 Z"');
    expect(result?.svg).toContain('fill="#221C00"');
  });

  it('切片按区域裁切导出，且不输出切片自身标记', () => {
    const doc = createDoc('SVG 切片', 400, 300);
    const page = doc.pages[0];
    const frameId = doc.nodes[page.rootId].children[0];
    doc.nodes['rect-a'] = rectNode('rect-a', frameId);
    doc.nodes[frameId].children = ['rect-a'];
    const slice: SceneNode = {
      ...rectNode('slice-a', frameId),
      type: 'slice',
      name: '切片 1',
      x: 100,
      y: 80,
      w: 160,
      h: 100,
      fills: [],
      cornerRadius: 0,
    };
    doc.nodes[slice.id] = slice;
    doc.nodes[frameId].children.push(slice.id);

    const result = renderSliceSvg(doc, slice.id, false, 1);
    expect(result).not.toBeNull();
    expect(result?.width).toBe(160);
    expect(result?.height).toBe(100);
    expect(result?.svg).toContain('viewBox="0 0 160 100"');
    expect(result?.svg).toContain('groma-slice-export');
    expect(result?.svg).toContain('x="-80" y="-50" width="80" height="60"');
    expect(result?.svg).not.toContain('切片 1');
  });

  it('区块导出不生成自身标签，只输出子内容', () => {
    const doc = createDoc('SVG 区块', 800, 600);
    const page = doc.pages[0];
    const frameId = doc.nodes[page.rootId].children[0];
    const sectionId = 'section-a';
    doc.nodes[sectionId] = {
      ...rectNode(sectionId, page.rootId),
      type: 'section',
      name: '区块 1',
      x: 0,
      y: 0,
      w: 800,
      h: 600,
      fills: [],
      cornerRadius: 0,
    };
    doc.nodes[page.rootId].children = [sectionId];
    doc.nodes[sectionId].children = [frameId];
    doc.nodes[frameId].parentId = sectionId;

    const result = renderFrameSvg(doc, sectionId, false, 1);
    expect(result?.svg).toContain('viewBox="0 0 800 600"');
    expect(result?.svg).toContain('<rect x="0" y="0" width="800" height="600" fill="#FFFFFF" />');
    expect(result?.svg).not.toContain('区块 1');
  });

  it('单个钢笔图层以自身包围盒为零点导出 SVG', () => {
    const doc = createDoc('SVG 钢笔', 300, 200);
    const page = doc.pages[0];
    const frameId = doc.nodes[page.rootId].children[0];
    const pen: SceneNode = {
      ...rectNode('pen-a', frameId),
      type: 'path',
      name: '钢笔 1',
      x: 10,
      y: 20,
      w: 100,
      h: 80,
      pathW: 100,
      pathH: 80,
      pathClosed: true,
      pathAnchors: [
        { x: 0, y: 0, inX: 0, inY: 0, outX: 0, outY: 0 },
        { x: 100, y: 80, inX: 100, inY: 80, outX: 100, outY: 80 },
      ],
      pathData: 'M 0 0 L 100 0 L 100 80 Z',
      fills: [{ type: 'solid', color: '#D9D9D9', opacity: 1 }],
      strokes: [],
    };
    doc.nodes[pen.id] = pen;
    doc.nodes[frameId].children = [pen.id];

    const result = renderNodeSvg(doc, pen.id, true, 1);
    expect(result).not.toBeNull();
    expect(result?.width).toBe(100);
    expect(result?.height).toBe(80);
    expect(result?.svg).toContain('viewBox="0 0 100 80"');
    expect(result?.svg).toContain('transform="translate(0 0)"');
    expect(result?.svg).toContain('d="M 0 0 L 100 0 L 100 80 Z"');
    expect(result?.svg).not.toContain('fill="#FFFFFF"');
  });

  it('多轮廓只给闭合轮廓填充，开放轮廓不隐式闭合', () => {
    const doc = createDoc('SVG 多轮廓', 300, 200);
    const page = doc.pages[0];
    const frameId = doc.nodes[page.rootId].children[0];
    const anchors = [
      { x: 0, y: 0, inX: 0, inY: 0, outX: 0, outY: 0 },
      { x: 80, y: 0, inX: 80, inY: 0, outX: 80, outY: 0 },
      { x: 80, y: 80, inX: 80, inY: 80, outX: 80, outY: 80 },
    ];
    const open = [
      { x: 10, y: 90, inX: 10, inY: 90, outX: 10, outY: 90 },
      { x: 50, y: 90, inX: 50, inY: 90, outX: 50, outY: 90 },
      { x: 90, y: 120, inX: 90, inY: 120, outX: 90, outY: 120 },
    ];
    const pen: SceneNode = {
      ...rectNode('pen-b', frameId),
      type: 'path',
      name: '钢笔 2',
      x: 10,
      y: 20,
      w: 100,
      h: 100,
      pathW: 100,
      pathH: 100,
      pathClosed: true,
      pathAnchors: anchors,
      pathContours: [
        { closed: true, anchors },
        { closed: false, anchors: open },
      ],
      pathData: 'M 0 0 L 80 0 L 80 80 Z M 10 90 L 50 90 L 90 120',
      fills: [{ type: 'solid', color: '#D9D9D9', opacity: 1 }],
      strokes: [],
    };
    doc.nodes[pen.id] = pen;
    doc.nodes[frameId].children = [pen.id];

    const result = renderNodeSvg(doc, pen.id, true, 1);
    expect(result).not.toBeNull();
    expect(result?.svg.match(/<path /g)?.length).toBe(2);
    expect(result?.svg).toContain('fill="#D9D9D9"');
    expect(result?.svg).toContain('fill="none"');
    expect(result?.svg).not.toContain('M 10 90 L 50 90 L 90 120 Z');
  });
});
