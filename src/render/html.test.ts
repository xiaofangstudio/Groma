import { describe, expect, it } from 'vitest';
import { createDoc } from '../core/doc';
import type { SceneNode } from '../core/types';
import { renderFrameHtml, renderNodeHtml } from './html';

function rectNode(id: string, parentId: string): SceneNode {
  return {
    id,
    type: 'rect',
    name: '渐变卡片',
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
    fills: [
      { type: 'linear', color: '#0EA5E9', opacity: 1, x1: 0, y1: 0, x2: 80, y2: 0, stops: [{ offset: 0, color: '#0EA5E9', opacity: 1 }, { offset: 1, color: '#6366F1', opacity: 1 }] },
      { type: 'solid', color: '#FFFFFF', opacity: 0.2 },
    ],
    cornerRadius: 12,
  };
}

describe('HTML 导出', () => {
  it('输出独立网页、尺寸、坐标、渐变与圆角', () => {
    const doc = createDoc('HTML 测试', 400, 300);
    const page = doc.pages[0];
    const frameId = doc.nodes[page.rootId].children[0];
    doc.nodes['rect-a'] = rectNode('rect-a', frameId);
    doc.nodes[frameId].children = ['rect-a'];

    const result = renderFrameHtml(doc, frameId);
    expect(result).not.toBeNull();
    expect(result?.html.startsWith('<!doctype html>')).toBe(true);
    expect(result?.html).toContain('width:400px;height:300px');
    expect(result?.html).toContain('left:20px;top:30px;width:80px;height:60px');
    expect(result?.html).toContain('linear-gradient(');
    expect(result?.html).toContain('border-radius:12px 12px 12px 12px');
    expect(result?.html).toContain('rgba(255, 255, 255, 0.2)');
    expect(result?.html).not.toContain('<script');
  });

  it('文字保持为可编辑 HTML，并转义内容', () => {
    const doc = createDoc('HTML 文本', 400, 300);
    const page = doc.pages[0];
    const frameId = doc.nodes[page.rootId].children[0];
    const text: SceneNode = {
      id: 'text-a',
      type: 'text',
      name: '标题',
      parentId: frameId,
      children: [],
      x: 10,
      y: 10,
      w: 200,
      h: 60,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      clipContent: false,
      fills: [{ type: 'solid', color: '#221C00', opacity: 1 }],
      cornerRadius: 0,
      text: 'A & B <C>',
      fontSize: 24,
      fontWeight: 700,
      align: 'left',
    };
    doc.nodes['text-a'] = text;
    doc.nodes[frameId].children = ['text-a'];

    const result = renderNodeHtml(doc, 'text-a');
    expect(result?.html).toContain('class="groma-node groma-text"');
    expect(result?.html).toContain('A &amp; B &lt;C&gt;');
    expect(result?.html).toContain('font-size:24px');
    expect(result?.html).toContain('font-weight:700');
  });

  it('隐藏图层不进入 HTML', () => {
    const doc = createDoc('HTML 隐藏', 400, 300);
    const page = doc.pages[0];
    const frameId = doc.nodes[page.rootId].children[0];
    doc.nodes['rect-a'] = { ...rectNode('rect-a', frameId), visible: false };
    doc.nodes[frameId].children = ['rect-a'];
    const result = renderFrameHtml(doc, frameId);
    expect(result?.html).not.toContain('data-node="rect-a"');
  });
});
