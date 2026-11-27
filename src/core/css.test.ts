import { describe, expect, it } from 'vitest';
import { createDoc } from './doc';
import { nodeCss } from './css';
import type { SceneNode } from './types';

function card(id: string, parentId: string): SceneNode {
  return {
    id,
    type: 'rect',
    name: '品牌卡片',
    parentId,
    children: [],
    x: 20,
    y: 30,
    w: 120,
    h: 80,
    rotation: 0,
    opacity: 0.9,
    visible: true,
    locked: false,
    clipContent: false,
    fills: [
      { type: 'linear', color: '#0EA5E9', opacity: 1, x1: 0, y1: 0, x2: 120, y2: 0, stops: [{ offset: 0, color: '#0EA5E9', opacity: 1 }, { offset: 1, color: '#6366F1', opacity: 1 }] },
      { type: 'solid', color: '#FFFFFF', opacity: 0.2 },
    ],
    strokes: [{ color: '#221C00', opacity: 1, width: 2, dash: [], cap: 'butt', join: 'miter' }],
    effects: [{ type: 'drop-shadow', x: 0, y: 8, blur: 20, color: '#221C00', opacity: 0.25, visible: true }],
    cornerRadius: 16,
  };
}

describe('图层 CSS', () => {
  it('输出定位、尺寸、多填充、描边、阴影与圆角', () => {
    const doc = createDoc('CSS', 400, 300);
    const frameId = doc.nodes[doc.pages[0].rootId].children[0];
    doc.nodes['card'] = card('card', frameId);
    const css = nodeCss(doc, 'card');
    expect(css).toContain('position: absolute;');
    expect(css).toContain('left: 20px;');
    expect(css).toContain('top: 30px;');
    expect(css).toContain('width: 120px;');
    expect(css).toContain('opacity: 0.9;');
    expect(css).toContain('background-image: linear-gradient(90deg');
    expect(css).toContain('border: 2px solid');
    expect(css).toContain('box-shadow: 0px 8px 20px');
    expect(css).toContain('border-radius: 16px 16px 16px 16px;');
  });

  it('文本输出字体与颜色', () => {
    const doc = createDoc('CSS 文本', 400, 300);
    const frameId = doc.nodes[doc.pages[0].rootId].children[0];
    doc.nodes['text'] = {
      ...card('text', frameId),
      type: 'text',
      text: '标题',
      fontSize: 32,
      fontWeight: 700,
      fontFamily: 'Segoe UI',
      lineHeight: 1.2,
      fills: [{ type: 'solid', color: '#221C00', opacity: 1 }],
      strokes: [],
      effects: [],
    };
    const css = nodeCss(doc, 'text');
    expect(css).toContain('font-family: Segoe UI;');
    expect(css).toContain('font-size: 32px;');
    expect(css).toContain('font-weight: 700;');
    expect(css).toContain('color: rgba(34, 28, 0, 1);');
  });

  it('页面和切片不输出', () => {
    const doc = createDoc('CSS 空', 400, 300);
    expect(nodeCss(doc, doc.pages[0].rootId)).toBe('');
  });
});
