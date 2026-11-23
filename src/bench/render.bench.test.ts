import { describe, expect, it } from 'vitest';
import { createDoc } from '../core/doc';
import { fitRect } from '../core/viewport';
import { drawEditor, drawPageThumbnail } from '../render/draw';
import type { GromaDoc, Page, SceneNode } from '../core/types';

function makeDoc(): { doc: GromaDoc; page: Page } {
  const doc = createDoc('渲染基准', 1440, 900);
  const page = doc.pages[0];
  const root = doc.nodes[page.rootId];
  root.children = [];

  let count = 0;
  for (let f = 0; f < 50; f += 1) {
    const frameId = `bench-frame-${f}`;
    const frame: SceneNode = {
      id: frameId,
      type: 'frame',
      name: `画板 ${f + 1}`,
      parentId: root.id,
      children: [],
      x: (f % 10) * 300,
      y: Math.floor(f / 10) * 200,
      w: 280,
      h: 180,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      clipContent: true,
      fills: [{ type: 'solid', color: '#FFFFFF', opacity: 1 }],
      cornerRadius: 16,
    };
    root.children.push(frameId);
    doc.nodes[frameId] = frame;
    count += 1;

    for (let i = 0; i < 100; i += 1) {
      const id = `bench-${f}-${i}`;
      const isText = i >= 90;
      const child: SceneNode = {
        id,
        type: isText ? 'text' : 'rect',
        name: isText ? `文本 ${i}` : `矩形 ${i}`,
        parentId: frameId,
        children: [],
        x: 8 + (i % 10) * 26,
        y: 8 + Math.floor(i / 10) * 15,
        w: 20,
        h: isText ? 12 : 8,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        clipContent: false,
        fills: [{ type: 'solid', color: i % 2 ? '#F2B705' : '#221C00', opacity: 1 }],
        cornerRadius: isText ? 0 : 3,
        ...(isText ? { text: '标题', fontSize: 9, fontWeight: 600 } : {}),
      };
      frame.children.push(id);
      doc.nodes[id] = child;
      count += 1;
    }
  }
  return { doc, page };
}

function makeContext() {
  const calls: Record<string, number> = {};
  const ctx: Record<string, unknown> = {
    globalAlpha: 1,
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetY: 0,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textBaseline: 'alphabetic',
    textAlign: 'left',
  };
  const methods = [
    'setTransform',
    'clearRect',
    'fillRect',
    'save',
    'restore',
    'translate',
    'beginPath',
    'rect',
    'clip',
    'moveTo',
    'lineTo',
    'stroke',
    'arcTo',
    'closePath',
    'fill',
    'strokeRect',
    'fillText',
    'ellipse',
    'setLineDash',
    'rotate',
  ];
  for (const name of methods) {
    ctx[name] = () => {
      calls[name] = (calls[name] ?? 0) + 1;
    };
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

describe('渲染基准', () => {
  it('5000 节点：统计、交互降级与视口裁剪', () => {
    const { doc, page } = makeDoc();
    const total = Object.keys(doc.nodes).length - 1;
    const view = { w: 1420, h: 880, dpr: 1 };
    const fit = fitRect({ x: 0, y: 0, w: 3000, h: 1000 }, view.w - 20, view.h - 20);
    const { ctx, calls } = makeContext();

    const stats = drawEditor(ctx, doc, page, fit, view, [], { interactive: false });
    expect(total).toBeGreaterThan(5000);
    expect(stats.nodesDrawn).toBeGreaterThan(5000);
    expect(stats.shadowPasses).toBe(50);
    expect(stats.nodesCulled).toBe(0);
    expect(calls.fill + calls.fillText).toBeGreaterThan(5000);

    for (let i = 0; i < 5; i += 1) drawEditor(ctx, doc, page, fit, view, []);
    const start = performance.now();
    for (let i = 0; i < 30; i += 1) drawEditor(ctx, doc, page, fit, view, []);
    const average = (performance.now() - start) / 30;
    // mock context 只量 JS 侧绘制调用，不量 GPU 光栅；这里只做回归参考。
    console.log(`[render] 5000节点 1420×880 平均 ${average.toFixed(2)}ms · fill ${calls.fill}`);

    const quiet = drawEditor(ctx, doc, page, fit, view, [], { interactive: true });
    expect(quiet.shadowPasses).toBe(0);

    const zoomed = drawEditor(ctx, doc, page, { x: 0, y: 0, scale: 2 }, view, []);
    expect(zoomed.nodesCulled).toBeGreaterThan(300);

    // 页缩略图不应该为了 34×22 把 5000 个亚像素节点全画一遍。
    const thumbCanvas = {
      width: 0,
      height: 0,
      getContext: () => ctx,
    } as unknown as HTMLCanvasElement;
    const thumbStats = drawPageThumbnail(thumbCanvas, doc, page, 34, 22, 1);
    expect(thumbStats.nodesDrawn).toBeGreaterThanOrEqual(50);
    expect(thumbStats.nodesDrawn).toBeLessThan(100);
    expect(thumbStats.nodesCulled).toBeGreaterThanOrEqual(5000);

    const thumbStart = performance.now();
    for (let i = 0; i < 30; i += 1) drawPageThumbnail(thumbCanvas, doc, page, 34, 22, 1);
    const thumbAverage = (performance.now() - thumbStart) / 30;
    console.log(`[thumb] 34×22 平均 ${thumbAverage.toFixed(2)}ms · 节点 ${thumbStats.nodesDrawn}/${total}`);
  });
});
