import { describe, expect, it } from 'vitest';
import { createDoc } from '../core/doc';
import type { SceneNode } from '../core/types';
import { renderFrameSvg } from './svg';

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
});
