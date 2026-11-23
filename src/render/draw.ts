import type { GromaDoc, Page, SceneNode } from '../core/types';
import { absoluteRect, selectionBounds } from '../core/geometry';
import type { Viewport } from '../core/viewport';

export const RULER = 20;

export interface ViewSize {
  w: number;
  h: number;
  dpr: number;
}

export interface WorldBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface DrawOptions {
  /** 拖动/缩放时降级细节，避免阴影和网格抢走交互帧。 */
  interactive?: boolean;
}

export interface DrawStats {
  nodesDrawn: number;
  nodesCulled: number;
  shadowPasses: number;
  gridDots: number;
}

interface InternalDrawOptions {
  interactive: boolean;
  stats: DrawStats;
  /** 缩略图只画到有限层，34×22 下更深的细节不可见。 */
  maxDepth?: number;
  /** 缩略图跳过投影后小于该像素尺寸的节点。 */
  minPixelSize?: number;
}

function newStats(): DrawStats {
  return { nodesDrawn: 0, nodesCulled: 0, shadowPasses: 0, gridDots: 0 };
}

function intersects(ax: number, ay: number, aw: number, ah: number, bounds?: WorldBounds | null): boolean {
  if (!bounds) return true;
  return ax + aw >= bounds.left && ay + ah >= bounds.top && ax <= bounds.right && ay <= bounds.bottom;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function fillColor(node: SceneNode): string {
  const fill = node.fills[0];
  if (!fill || fill.opacity <= 0) return 'transparent';
  return fill.color;
}

function drawSection(
  ctx: CanvasRenderingContext2D,
  doc: GromaDoc,
  node: SceneNode,
  ox: number,
  oy: number,
  v: Viewport,
  opts: InternalDrawOptions,
  bounds?: WorldBounds | null,
  depth = 0,
) {
  const x = (ox + node.x) * v.scale + v.x;
  const y = (oy + node.y) * v.scale + v.y;
  const w = node.w * v.scale;
  const h = node.h * v.scale;
  const radius = node.cornerRadius * v.scale;

  ctx.save();
  ctx.globalAlpha = node.opacity;
  if (node.fills.length > 0) {
    ctx.fillStyle = fillColor(node);
    roundRect(ctx, x, y, w, h, radius);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(76, 70, 60, 0.34)';
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, radius);
  ctx.stroke();

  if (v.scale >= 0.15 && w > 24) {
    ctx.globalAlpha = 1;
    ctx.font = '600 12px "Segoe UI", "Microsoft YaHei UI", sans-serif';
    ctx.fillStyle = '#6D685E';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillText(node.name, x, y - 7);
  }

  if (depth < (opts.maxDepth ?? Infinity)) {
    for (const childId of node.children) {
      const child = doc.nodes[childId];
      if (child) drawNode(ctx, doc, child, ox + node.x, oy + node.y, v, opts, bounds, depth + 1);
    }
  }
  ctx.restore();
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  doc: GromaDoc,
  node: SceneNode,
  ox: number,
  oy: number,
  v: Viewport,
  opts: InternalDrawOptions,
  bounds?: WorldBounds | null,
  depth = 0,
) {
  const x = (ox + node.x) * v.scale + v.x;
  const y = (oy + node.y) * v.scale + v.y;
  const w = node.w * v.scale;
  const h = node.h * v.scale;
  const radius = node.cornerRadius * v.scale;
  const artboard = doc.nodes[node.parentId ?? '']?.type === 'page';

  ctx.save();
  ctx.globalAlpha = node.opacity;
  if (artboard && !opts.interactive) {
    ctx.shadowColor = 'rgba(34, 28, 0, 0.10)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    opts.stats.shadowPasses += 1;
  }
  ctx.fillStyle = fillColor(node);
  roundRect(ctx, x, y, w, h, radius);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.strokeStyle = artboard ? 'rgba(34, 28, 0, 0.12)' : 'rgba(34, 28, 0, 0.18)';
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, radius);
  ctx.stroke();

  if (artboard && !opts.interactive && v.scale > 0.05) {
    ctx.globalAlpha = 1;
    ctx.font = '12px "Segoe UI", "Microsoft YaHei UI", sans-serif';
    ctx.fillStyle = '#6D685E';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(node.name, x, y - 8);
  }

  if (node.clipContent) {
    roundRect(ctx, x, y, w, h, radius);
    ctx.clip();
  }
  if (depth < (opts.maxDepth ?? Infinity)) {
    for (const childId of node.children) {
      const child = doc.nodes[childId];
      if (child) drawNode(ctx, doc, child, ox + node.x, oy + node.y, v, opts, bounds, depth + 1);
    }
  }
  ctx.restore();
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  node: SceneNode,
  ox: number,
  oy: number,
  v: Viewport,
) {
  const x = (ox + node.x) * v.scale + v.x;
  const y = (oy + node.y) * v.scale + v.y;
  const w = node.w * v.scale;
  const h = node.h * v.scale;

  ctx.save();
  ctx.globalAlpha = node.opacity;
  ctx.fillStyle = fillColor(node);

  if (node.type === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, Math.max(w / 2, 0.5), Math.max(h / 2, 0.5), 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (node.type === 'text') {
    const fs = Math.max(1, (node.fontSize ?? 24) * v.scale);
    const weight = node.fontWeight ?? 500;
    ctx.font = `${weight} ${fs}px "Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.beginPath();
    ctx.rect(x, y, Math.max(w, 1), Math.max(h, 1));
    ctx.clip();
    const lines = (node.text ?? '文本').split('\n');
    lines.forEach((line, i) => {
      ctx.fillText(line, x, y + i * fs * 1.3);
    });
  } else {
    roundRect(ctx, x, y, w, h, node.cornerRadius * v.scale);
    ctx.fill();
  }
  ctx.restore();
}

function drawNode(
  ctx: CanvasRenderingContext2D,
  doc: GromaDoc,
  node: SceneNode,
  ox: number,
  oy: number,
  v: Viewport,
  opts: InternalDrawOptions,
  bounds?: WorldBounds | null,
  depth = 0,
) {
  if (!node.visible) {
    opts.stats.nodesCulled += 1;
    return;
  }
  if (node.type !== 'page' && node.type !== 'group' && !intersects(ox + node.x, oy + node.y, node.w, node.h, bounds)) {
    opts.stats.nodesCulled += 1;
    return;
  }
  const min = opts.minPixelSize;
  if (min && node.type !== 'page' && node.type !== 'group') {
    const px = Math.max(node.w * v.scale, node.h * v.scale);
    if (px > 0 && px < min) {
      opts.stats.nodesCulled += 1;
      return;
    }
  }
  opts.stats.nodesDrawn += 1;
  if (node.type === 'frame') {
    drawFrame(ctx, doc, node, ox, oy, v, opts, bounds, depth);
  } else if (node.type === 'section') {
    drawSection(ctx, doc, node, ox, oy, v, opts, bounds, depth);
  } else if (node.type === 'rect' || node.type === 'ellipse' || node.type === 'text') {
    drawShape(ctx, node, ox, oy, v);
  } else if (depth < (opts.maxDepth ?? Infinity)) {
    for (const childId of node.children) {
      const child = doc.nodes[childId];
      if (child) drawNode(ctx, doc, child, ox + node.x, oy + node.y, v, opts, bounds, depth + 1);
    }
  }
}

function drawSelection(ctx: CanvasRenderingContext2D, doc: GromaDoc, selectedIds: string[], v: Viewport) {
  const nodes = selectedIds.map((id) => doc.nodes[id]).filter((node): node is SceneNode => Boolean(node && node.type !== 'page'));
  if (nodes.length === 0) return;

  ctx.save();
  ctx.strokeStyle = '#F2B705';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);
  for (const node of nodes) {
    const r = absoluteRect(doc, node.id);
    ctx.strokeRect(r.x * v.scale + v.x - 0.5, r.y * v.scale + v.y - 0.5, r.w * v.scale + 1, r.h * v.scale + 1);
  }

  if (nodes.length === 1 && nodes[0].type !== 'group') {
    const r = absoluteRect(doc, nodes[0].id);
    const x = r.x * v.scale + v.x;
    const y = r.y * v.scale + v.y;
    const w = r.w * v.scale;
    const h = r.h * v.scale;
    const hs = 6;
    const corners: Array<[number, number]> = [
      [x, y],
      [x + w, y],
      [x, y + h],
      [x + w, y + h],
    ];
    for (const [cx, cy] of corners) {
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#F2B705';
      ctx.lineWidth = 1;
      ctx.fillRect(cx - hs / 2, cy - hs / 2, hs, hs);
      ctx.strokeRect(cx - hs / 2, cy - hs / 2, hs, hs);
    }
  } else {
    const bounds = selectionBounds(doc, selectedIds);
    if (bounds) {
      ctx.strokeStyle = 'rgba(242, 183, 5, 0.55)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(
        bounds.x * v.scale + v.x - 0.5,
        bounds.y * v.scale + v.y - 0.5,
        bounds.w * v.scale + 1,
        bounds.h * v.scale + 1,
      );
    }
  }
  ctx.restore();
}

function drawDotGrid(
  ctx: CanvasRenderingContext2D,
  v: Viewport,
  w: number,
  h: number,
  opts: InternalDrawOptions,
) {
  if (opts.interactive || v.scale < 8) return;
  const stepWorld = 8;
  const stepPx = stepWorld * v.scale;
  if (stepPx < 24) return;

  const x0 = Math.floor(-v.x / stepWorld) * stepWorld;
  const x1 = (w - v.x) / v.scale;
  const y0 = Math.floor(-v.y / stepWorld) * stepWorld;
  const y1 = (h - v.y) / v.scale;

  ctx.save();
  ctx.fillStyle = 'rgba(34, 28, 0, 0.18)';
  for (let wx = x0; wx <= x1; wx += stepWorld) {
    for (let wy = y0; wy <= y1; wy += stepWorld) {
      const sx = wx * v.scale + v.x;
      const sy = wy * v.scale + v.y;
      ctx.fillRect(sx, sy, 1, 1);
      opts.stats.gridDots += 1;
    }
  }
  ctx.restore();
}

function niceStep(scale: number): number {
  const target = 64;
  const candidates = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
  for (const c of candidates) if (c * scale >= target) return c;
  return 100000;
}

export function drawRulers(ctx: CanvasRenderingContext2D, v: Viewport, w: number, h: number) {
  const contentW = w - RULER;
  const contentH = h - RULER;

  ctx.save();
  ctx.fillStyle = '#F8F7F4';
  ctx.fillRect(0, 0, w, RULER);
  ctx.fillRect(0, 0, RULER, h);

  ctx.strokeStyle = '#E4E1D8';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, RULER - 0.5);
  ctx.lineTo(w, RULER - 0.5);
  ctx.moveTo(RULER - 0.5, 0);
  ctx.lineTo(RULER - 0.5, h);
  ctx.stroke();

  const step = niceStep(v.scale);
  const minor = step / 5;
  const worldLeft = (0 - v.x) / v.scale;
  const worldRight = (contentW - v.x) / v.scale;
  const worldTop = (0 - v.y) / v.scale;
  const worldBottom = (contentH - v.y) / v.scale;

  ctx.font = '10px "Segoe UI", "Microsoft YaHei UI", sans-serif';
  ctx.fillStyle = '#A19B8E';
  ctx.strokeStyle = 'rgba(34, 28, 0, 0.18)';
  ctx.lineWidth = 1;

  const startX = Math.floor(worldLeft / minor) * minor;
  for (let wx = startX; wx <= worldRight; wx += minor) {
    const sx = wx * v.scale + v.x + RULER;
    if (sx < RULER || sx > w) continue;
    const major = Math.abs(wx % step) < minor / 10 || Math.abs(Math.abs(wx % step) - step) < minor / 10;
    const len = major ? 8 : 4;
    ctx.beginPath();
    ctx.moveTo(Math.round(sx) + 0.5, RULER);
    ctx.lineTo(Math.round(sx) + 0.5, RULER - len);
    ctx.stroke();
    if (major && sx < w - 24) {
      ctx.fillText(String(Math.round(wx)), sx + 3, RULER - 8);
    }
  }

  const startY = Math.floor(worldTop / minor) * minor;
  for (let wy = startY; wy <= worldBottom; wy += minor) {
    const sy = wy * v.scale + v.y + RULER;
    if (sy < RULER || sy > h) continue;
    const major = Math.abs(wy % step) < minor / 10 || Math.abs(Math.abs(wy % step) - step) < minor / 10;
    const len = major ? 8 : 4;
    ctx.beginPath();
    ctx.moveTo(RULER, Math.round(sy) + 0.5);
    ctx.lineTo(RULER - len, Math.round(sy) + 0.5);
    ctx.stroke();
    if (major && sy < h - 12) {
      ctx.save();
      ctx.translate(RULER - 8, sy + 3);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(String(Math.round(wy)), 0, 0);
      ctx.restore();
    }
  }

  ctx.fillStyle = '#F1EFE9';
  ctx.fillRect(0, 0, RULER, RULER);
  ctx.strokeStyle = '#E4E1D8';
  ctx.strokeRect(0.5, 0.5, RULER, RULER);
  ctx.restore();
}

export function drawEditor(
  ctx: CanvasRenderingContext2D,
  doc: GromaDoc,
  page: Page,
  v: Viewport,
  view: ViewSize,
  selectedIds: string[],
  options?: DrawOptions,
): DrawStats {
  const { w, h, dpr } = view;
  const stats = newStats();
  const opts: InternalDrawOptions = { interactive: options?.interactive === true, stats };
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = page.background;
  ctx.fillRect(0, 0, w, h);

  const contentW = w - RULER;
  const contentH = h - RULER;

  ctx.save();
  ctx.beginPath();
  ctx.rect(RULER, RULER, contentW, contentH);
  ctx.clip();
  ctx.translate(RULER, RULER);
  drawDotGrid(ctx, v, contentW, contentH, opts);

  const root = doc.nodes[page.rootId];
  const bounds: WorldBounds = {
    left: -v.x / v.scale,
    top: -v.y / v.scale,
    right: (contentW - v.x) / v.scale,
    bottom: (contentH - v.y) / v.scale,
  };
  if (root) {
    for (const id of root.children) {
      const node = doc.nodes[id];
      if (node) drawNode(ctx, doc, node, 0, 0, v, opts, bounds);
    }
  }
  drawSelection(ctx, doc, selectedIds, v);
  ctx.restore();

  drawRulers(ctx, v, w, h);
  return stats;
}

export interface FrameExport {
  dataUrl: string;
  width: number;
  height: number;
  scale: number;
}

/**
 * 把单个画板/区块渲染成位图。与编辑器画布共用同一套绘制函数，
 * 保证屏幕上看到的和导出结果不会两套逻辑。
 */
function renderFrameRaster(
  doc: GromaDoc,
  frameId: string,
  scale: number,
  transparent: boolean,
  mime: 'image/png' | 'image/jpeg',
  quality = 0.92,
): FrameExport | null {
  const frame = doc.nodes[frameId];
  if (!frame || (frame.type !== 'frame' && frame.type !== 'section')) return null;
  const safeScale = Math.max(0.5, Math.min(4, scale));
  const width = Math.max(1, Math.round(frame.w * safeScale));
  const height = Math.max(1, Math.round(frame.h * safeScale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.setTransform(safeScale, 0, 0, safeScale, 0, 0);
  ctx.globalAlpha = frame.opacity;

  const opaque = !transparent || mime === 'image/jpeg';
  if (opaque) {
    const bg = fillColor(frame);
    ctx.fillStyle = bg === 'transparent' ? '#FFFFFF' : bg;
    roundRect(ctx, 0, 0, frame.w, frame.h, frame.cornerRadius);
    ctx.fill();
  }

  ctx.save();
  roundRect(ctx, 0, 0, frame.w, frame.h, frame.cornerRadius);
  ctx.clip();
  const exportOpts: InternalDrawOptions = { interactive: false, stats: newStats() };
  for (const childId of frame.children) {
    const child = doc.nodes[childId];
    if (child) drawNode(ctx, doc, child, 0, 0, { x: 0, y: 0, scale: 1 }, exportOpts);
  }
  ctx.restore();

  return {
    dataUrl: mime === 'image/jpeg' ? canvas.toDataURL('image/jpeg', quality) : canvas.toDataURL('image/png'),
    width: frame.w,
    height: frame.h,
    scale: safeScale,
  };
}

export function renderFramePng(
  doc: GromaDoc,
  frameId: string,
  scale: number,
  transparent: boolean,
): FrameExport | null {
  return renderFrameRaster(doc, frameId, scale, transparent, 'image/png');
}

export function renderFrameJpg(
  doc: GromaDoc,
  frameId: string,
  scale: number,
  transparent: boolean,
): FrameExport | null {
  return renderFrameRaster(doc, frameId, scale, transparent, 'image/jpeg');
}

/**
 * 把整页内容画进页列表的小缩略图。复用同一套 drawNode，
 * 但抑制画板阴影和名称，保证 34×22 的尺寸下仍能看清版面。
 */
export function drawPageThumbnail(
  canvas: HTMLCanvasElement,
  doc: GromaDoc,
  page: Page,
  cssW: number,
  cssH: number,
  dpr = window.devicePixelRatio || 1,
): DrawStats {
  const stats = newStats();
  const width = Math.max(1, Math.round(cssW * dpr));
  const height = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return stats;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.fillStyle = page.background || '#E9E8E4';
  ctx.fillRect(0, 0, cssW, cssH);

  const root = doc.nodes[page.rootId];
  if (!root || root.children.length === 0) {
    ctx.fillStyle = 'rgba(109, 104, 94, 0.42)';
    ctx.font = '8px "Segoe UI", "Microsoft YaHei UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('空', cssW / 2, cssH / 2 + 0.5);
    return stats;
  }

  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const childId of root.children) {
    const child = doc.nodes[childId];
    if (!child || !child.visible) continue;
    const rect = absoluteRect(doc, child.id);
    if (rect.w <= 0 || rect.h <= 0) continue;
    left = Math.min(left, rect.x);
    top = Math.min(top, rect.y);
    right = Math.max(right, rect.x + rect.w);
    bottom = Math.max(bottom, rect.y + rect.h);
  }
  if (!Number.isFinite(left) || !Number.isFinite(top)) {
    ctx.fillStyle = 'rgba(109, 104, 94, 0.42)';
    ctx.font = '8px "Segoe UI", "Microsoft YaHei UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('空', cssW / 2, cssH / 2 + 0.5);
    return stats;
  }

  const contentW = Math.max(1, right - left);
  const contentH = Math.max(1, bottom - top);
  const pad = 2;
  const scale = Math.min((cssW - pad * 2) / contentW, (cssH - pad * 2) / contentH, 10);
  const tx = (cssW - contentW * scale) / 2 - left * scale;
  const ty = (cssH - contentH * scale) / 2 - top * scale;
  // 34×22 的缩略图不需要画整棵深树：限制层数并跳过亚像素节点，
  // 避免一次拖动时缩略图和主画布同时做整页绘制。
  const opts: InternalDrawOptions = {
    interactive: true,
    stats,
    maxDepth: 3,
    minPixelSize: 0.5,
  };
  for (const childId of root.children) {
    const child = doc.nodes[childId];
    if (child) drawNode(ctx, doc, child, 0, 0, { x: tx, y: ty, scale }, opts);
  }
  return stats;
}
