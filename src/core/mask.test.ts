import { describe, expect, it } from 'vitest';
import { createDoc } from './doc';
import { hitTestDeep, absoluteRect } from './geometry';
import { maskEligibility, pointInMask, maskForParent } from './mask';
import { renderFrameSvg } from '../render/svg';
import type { GromaDoc, SceneNode } from './types';

function maskDoc(): { doc: GromaDoc; frame: string; mask: string; top: string } {
  const doc = createDoc('蒙版测试');
  const frameId = doc.nodes[doc.pages[0].rootId].children[0];
  const frame = doc.nodes[frameId];
  const base: SceneNode = {
    ...frame,
    id: 'mask',
    type: 'rect',
    name: '蒙版形状',
    parentId: frameId,
    children: [],
    x: 50,
    y: 40,
    w: 200,
    h: 120,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    clipContent: false,
    isMask: true,
    fills: [{ type: 'solid', color: '#F2B705', opacity: 1 }],
    strokes: [],
  };
  const top: SceneNode = {
    ...base,
    id: 'top',
    type: 'rect',
    name: '被裁切图层',
    isMask: undefined,
    x: 0,
    y: 0,
    w: 400,
    h: 300,
    fills: [{ type: 'solid', color: '#2F6BFF', opacity: 1 }],
  };
  doc.nodes[frameId] = { ...frame, children: ['mask', 'top'] };
  doc.nodes.mask = base;
  doc.nodes.top = top;
  return { doc, frame: frameId, mask: 'mask', top: 'top' };
}

describe('形状蒙版', () => {
  it('识别可用蒙版，并要求同容器唯一且上方有图层', () => {
    const { doc, mask } = maskDoc();
    expect(maskEligibility(doc, mask).ok).toBe(true);
    expect(maskEligibility(doc, mask).aboveIds).toEqual(['top']);
    expect(maskForParent(doc, doc.nodes[doc.nodes[mask].parentId!])?.id).toBe(mask);

    const top = doc.nodes.top;
    expect(maskEligibility(doc, top.id).ok).toBe(false);

    const other = { ...doc.nodes[mask], id: 'other', isMask: true, x: 80 };
    doc.nodes.other = other;
    doc.nodes[doc.nodes[mask].parentId!] = {
      ...doc.nodes[doc.nodes[mask].parentId!],
      children: ['mask', 'other', 'top'],
    };
    doc.nodes.top = { ...doc.nodes.top, parentId: doc.nodes[mask].parentId };
    expect(maskEligibility(doc, mask).ok).toBe(false);
  });

  it('点包含按 evenodd 处理矩形与椭圆轮廓', () => {
    const { doc, mask } = maskDoc();
    const rect = absoluteRect(doc, mask);
    expect(pointInMask(doc, doc.nodes[mask], 200, 150)).toBe(true);
    expect(pointInMask(doc, doc.nodes[mask], 40, 150)).toBe(false);
    expect(pointInMask(doc, doc.nodes[mask], 260, 150)).toBe(false);

    doc.nodes[mask] = { ...doc.nodes[mask], type: 'ellipse' };
    const centerX = rect.x + rect.w / 2;
    const centerY = rect.y + rect.h / 2;
    expect(pointInMask(doc, doc.nodes[mask], centerX, centerY)).toBe(true);
    expect(pointInMask(doc, doc.nodes[mask], rect.x + 2, rect.y + 2)).toBe(false);
  });

  it('命中测试不选中蒙版外被裁切的图层', () => {
    const { doc, frame, top } = maskDoc();
    const inside = hitTestDeep(doc, doc.pages[0], 200, 150);
    expect(inside?.id).toBe(top);
    const outside = hitTestDeep(doc, doc.pages[0], 20, 20);
    expect(outside?.id).toBe(frame);
    expect(outside?.id).not.toBe('mask');
  });

  it('画板 SVG 导出用 clipPath 包住蒙版上方图层', () => {
    const { doc, frame } = maskDoc();
    const svg = renderFrameSvg(doc, frame, true, 1);
    expect(svg).not.toBeNull();
    expect(svg?.svg).toContain('groma-mask-');
    expect(svg?.svg).toContain('clip-path="url(#groma-mask-');
    expect(svg?.svg).toContain('fill-rule="evenodd"');
  });

  it('Alpha / 亮度蒙版导出为 SVG mask，而不是 clipPath', () => {
    const { doc, frame, mask } = maskDoc();
    doc.nodes[mask] = { ...doc.nodes[mask], maskType: 'alpha' };
    const alpha = renderFrameSvg(doc, frame, true, 1)?.svg ?? '';
    expect(alpha).toContain('mask-type="alpha"');
    expect(alpha).toContain('mask="url(#groma-mask-');
    expect(alpha).not.toContain('clip-path="url(#groma-mask-');

    doc.nodes[mask] = { ...doc.nodes[mask], maskType: 'luminance' };
    const luminance = renderFrameSvg(doc, frame, true, 1)?.svg ?? '';
    expect(luminance).toContain('mask-type="luminance"');
  });
});
