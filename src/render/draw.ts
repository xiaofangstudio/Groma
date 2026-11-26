import type { GromaDoc, Page, SceneNode } from '../core/types';
import { absoluteRect, selectionBounds } from '../core/geometry';
import { nodePathContours, penPathData } from '../core/pen';
import { nodeWorldRings } from '../core/boolean';
import { maskIndexForParent, maskTypeOf } from '../core/mask';
import { imageCropOf, imageSourceRect, FULL_IMAGE_CROP } from '../core/image';
import { imageFillBox } from '../core/imageFill';
import type { Viewport } from '../core/viewport';
import { getAssetImage, requestImageAsset } from '../io/images';

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
  /** 裁剪模式下该图片按整张源图绘制，方便看到框外待恢复内容。 */
  cropPreviewId?: string | null;
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
  /** 导出切片时隐藏画板边框、阴影、名称与区块边框等编辑装饰。 */
  hideChrome?: boolean;
  /** 导出/缩略图重绘时跳过切片虚线等纯编辑标记。 */
  exporting?: boolean;
  cropPreviewId?: string | null;
}

function newStats(): DrawStats {
  return { nodesDrawn: 0, nodesCulled: 0, shadowPasses: 0, gridDots: 0 };
}

function intersects(ax: number, ay: number, aw: number, ah: number, bounds?: WorldBounds | null): boolean {
  if (!bounds) return true;
  return ax + aw >= bounds.left && ay + ah >= bounds.top && ax <= bounds.right && ay <= bounds.bottom;
}

const FRAME_INDEX_CELL = 512;
const FRAME_INDEX_MAX_CELLS = 64;
const FRAME_INDEX_MAX_QUERY_CELLS = 4096;
const frameIndexCache = new WeakMap<GromaDoc, Map<string, FrameSpatialIndex>>();

interface FrameSpatialIndex {
  orders: string[];
  signature: number;
  grid: Map<string, number[]>;
  oversized: Array<{ order: number; left: number; top: number; right: number; bottom: number }>;
}

function cellKey(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

/** 画板位置/尺寸/旋转/显隐都可能原地变化，用轻量签名让索引随编辑失效。 */
function frameIndexSignature(doc: GromaDoc, root: SceneNode): number {
  let hash = 2166136261;
  const mix = (value: number) => {
    hash = Math.imul(hash ^ (value | 0), 16777619);
  };
  mix(root.children.length);
  for (const id of root.children) {
    const node = doc.nodes[id];
    if (!node) {
      mix(0x7fffffff);
      continue;
    }
    mix(Math.round(node.x * 100));
    mix(Math.round(node.y * 100));
    mix(Math.round(node.w * 100));
    mix(Math.round(node.h * 100));
    mix(Math.round(node.rotation * 1000));
    mix((node.visible ? 1 : 0) | (node.isMask ? 2 : 0));
  }
  return hash;
}

function frameAabb(node: SceneNode): { left: number; top: number; right: number; bottom: number } {
  const w = Math.max(1, node.w);
  const h = Math.max(1, node.h);
  if (!node.rotation) {
    return { left: node.x, top: node.y, right: node.x + w, bottom: node.y + h };
  }
  const cx = node.x + w / 2;
  const cy = node.y + h / 2;
  const cos = Math.cos((node.rotation * Math.PI) / 180);
  const sin = Math.sin((node.rotation * Math.PI) / 180);
  const corners = [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ].map(([x, y]) => [cx + x * cos - y * sin, cy + x * sin + y * cos]);
  return {
    left: Math.min(...corners.map(([x]) => x)),
    top: Math.min(...corners.map(([, y]) => y)),
    right: Math.max(...corners.map(([x]) => x)),
    bottom: Math.max(...corners.map(([, y]) => y)),
  };
}

/** 根级画板空间索引：只扫视口覆盖的网格，不再逐块遍历全部画板。 */
function frameIndexFor(doc: GromaDoc, root: SceneNode): FrameSpatialIndex | null {
  if (root.children.length < 24) return null;
  const signature = frameIndexSignature(doc, root);
  const cached = frameIndexCache.get(doc)?.get(root.id);
  if (cached && cached.orders === root.children && cached.signature === signature) return cached;

  const grid = new Map<string, number[]>();
  const oversized: FrameSpatialIndex['oversized'] = [];
  for (let order = 0; order < root.children.length; order += 1) {
    const node = doc.nodes[root.children[order]];
    if (!node) continue;
    if (node.isMask) return null;
    if (!node.visible) continue;
    const { left, top, right, bottom } = frameAabb(node);
    const minCx = Math.floor(left / FRAME_INDEX_CELL);
    const maxCx = Math.floor(right / FRAME_INDEX_CELL);
    const minCy = Math.floor(top / FRAME_INDEX_CELL);
    const maxCy = Math.floor(bottom / FRAME_INDEX_CELL);
    if ((maxCx - minCx + 1) * (maxCy - minCy + 1) > FRAME_INDEX_MAX_CELLS) {
      oversized.push({ order, left, top, right, bottom });
      continue;
    }
    for (let cy = minCy; cy <= maxCy; cy += 1) {
      for (let cx = minCx; cx <= maxCx; cx += 1) {
        const key = cellKey(cx, cy);
        const bucket = grid.get(key);
        if (bucket) bucket.push(order);
        else grid.set(key, [order]);
      }
    }
  }
  const index: FrameSpatialIndex = { orders: root.children, signature, grid, oversized };
  const perDoc = frameIndexCache.get(doc) ?? new Map<string, FrameSpatialIndex>();
  perDoc.set(root.id, index);
  frameIndexCache.set(doc, perDoc);
  return index;
}

function visibleFrameOrders(index: FrameSpatialIndex, bounds: WorldBounds, v: Viewport): string[] | null {
  const pad = 48 / Math.max(v.scale, 0.01);
  const left = bounds.left - pad;
  const top = bounds.top - pad;
  const right = bounds.right + pad;
  const bottom = bounds.bottom + pad;
  const minCx = Math.floor(left / FRAME_INDEX_CELL);
  const maxCx = Math.floor(right / FRAME_INDEX_CELL);
  const minCy = Math.floor(top / FRAME_INDEX_CELL);
  const maxCy = Math.floor(bottom / FRAME_INDEX_CELL);
  if ((maxCx - minCx + 1) * (maxCy - minCy + 1) > FRAME_INDEX_MAX_QUERY_CELLS) return null;

  const hitOrders = new Set<number>();
  for (const frame of index.oversized) {
    if (frame.right >= left && frame.bottom >= top && frame.left <= right && frame.top <= bottom) {
      hitOrders.add(frame.order);
    }
  }
  for (let cy = minCy; cy <= maxCy; cy += 1) {
    for (let cx = minCx; cx <= maxCx; cx += 1) {
      const bucket = index.grid.get(cellKey(cx, cy));
      if (!bucket) continue;
      for (const order of bucket) hitOrders.add(order);
    }
  }
  return [...hitOrders]
    .sort((a, b) => a - b)
    .map((order) => index.orders[order]);
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

function pageRootOf(doc: GromaDoc, nodeId: string): SceneNode | null {
  let node: SceneNode | undefined = doc.nodes[nodeId];
  let guard = 0;
  while (node && node.type !== 'page' && node.parentId && guard < 128) {
    node = doc.nodes[node.parentId];
    guard += 1;
  }
  return node && node.type === 'page' ? node : null;
}

function fillColor(node: SceneNode): string {  const fill = node.fills[0];
  if (!fill || fill.opacity <= 0) return 'transparent';
  return fill.color;
}

function withAlpha(color: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return color;
  const value = match[1];
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** 在给定用户坐标里构造画布填充；纯色与渐变共用一条路径。 */
function makeFill(ctx: CanvasRenderingContext2D, node: SceneNode, x: number, y: number, w: number, h: number) {
  const paint = node.fills[0];
  if (!paint || paint.opacity <= 0) {
    ctx.fillStyle = 'transparent';
    return;
  }
  ctx.globalAlpha *= paint.opacity;
  if (paint.type === 'linear' && paint.stops.length > 0) {
    const gradient = ctx.createLinearGradient(paint.x1, paint.y1, paint.x2, paint.y2);
    for (const stop of paint.stops) {
      gradient.addColorStop(stop.offset, withAlpha(stop.color, stop.opacity));
    }
    ctx.fillStyle = gradient;
    return;
  }
  if (paint.type === 'radial' && paint.stops.length > 0) {
    const gradient = ctx.createRadialGradient(paint.cx, paint.cy, 0, paint.cx, paint.cy, Math.max(0.01, paint.r));
    for (const stop of paint.stops) {
      gradient.addColorStop(stop.offset, withAlpha(stop.color, stop.opacity));
    }
    ctx.fillStyle = gradient;
    return;
  }
  ctx.fillStyle = paint.color;
  void x;
  void y;
  void w;
  void h;
}

function paintStroke(ctx: CanvasRenderingContext2D, node: SceneNode): boolean {
  const stroke = node.strokes?.[0];
  if (!stroke || stroke.width <= 0 || stroke.opacity <= 0) return false;
  ctx.globalAlpha *= stroke.opacity;
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = stroke.cap;
  ctx.lineJoin = stroke.join;
  if (stroke.dash.length > 0) ctx.setLineDash(stroke.dash);
  return true;
}

/** 矩形/椭圆上的图片填充；返回 true 表示已画，调用方不要再铺纯色/渐变。 */
function drawShapeImageFill(
  ctx: CanvasRenderingContext2D,
  doc: GromaDoc,
  node: SceneNode,
  x: number,
  y: number,
  w: number,
  h: number,
  v: Viewport,
): boolean {
  const fill = node.imageFill;
  if (!fill) return false;
  const asset = doc.assets?.[fill.assetId];
  if (!asset) return false;
  const image = getAssetImage(asset.id);
  if (!image) {
    requestImageAsset(asset);
    return false;
  }
  const box = imageFillBox(asset.w, asset.h, node.w, node.h, fill);
  ctx.save();
  ctx.globalAlpha *= fill.opacity;
  if (node.type === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, Math.max(w / 2, 0.5), Math.max(h / 2, 0.5), 0, 0, Math.PI * 2);
  } else {
    roundRect(ctx, x, y, w, h, node.cornerRadius * v.scale);
  }
  ctx.clip();
  ctx.drawImage(image, x + box.x * v.scale, y + box.y * v.scale, box.w * v.scale, box.h * v.scale);
  ctx.restore();
  return true;
}

/** 路径局部坐标里的图片填充；path 已在同一变换下构造。 */
function drawPathImageFill(
  ctx: CanvasRenderingContext2D,
  doc: GromaDoc,
  node: SceneNode,
  sourceW: number,
  sourceH: number,
  path: Path2D,
  fillRule: CanvasFillRule,
): boolean {
  const fill = node.imageFill;
  if (!fill) return false;
  const asset = doc.assets?.[fill.assetId];
  if (!asset) return false;
  const image = getAssetImage(asset.id);
  if (!image) {
    requestImageAsset(asset);
    return false;
  }
  const box = imageFillBox(asset.w, asset.h, sourceW, sourceH, fill);
  ctx.save();
  ctx.globalAlpha *= fill.opacity;
  ctx.clip(path, fillRule);
  ctx.drawImage(image, box.x, box.y, box.w, box.h);
  ctx.restore();
  return true;
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
  if (!opts.hideChrome) {
    roundRect(ctx, x, y, w, h, radius);
    ctx.stroke();
  }

  if (!opts.hideChrome && v.scale >= 0.15 && w > 24) {
    ctx.globalAlpha = 1;
    ctx.font = '600 12px "Segoe UI", "Microsoft YaHei UI", sans-serif';
    ctx.fillStyle = '#6D685E';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillText(node.name, x, y - 7);
  }

  if (depth < (opts.maxDepth ?? Infinity)) {
    drawChildren(ctx, doc, node, ox + node.x, oy + node.y, v, opts, bounds, depth + 1);
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
  if (artboard && !opts.interactive && !opts.hideChrome) {
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
  if (!opts.hideChrome) {
    roundRect(ctx, x, y, w, h, radius);
    ctx.stroke();
  }

  if (artboard && !opts.interactive && !opts.hideChrome && v.scale > 0.05) {
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
    drawChildren(ctx, doc, node, ox + node.x, oy + node.y, v, opts, bounds, depth + 1);
  }
  ctx.restore();
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  doc: GromaDoc,
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

  if (node.type === 'ellipse') {
    if (!drawShapeImageFill(ctx, doc, node, x, y, w, h, v)) {
      makeFill(ctx, node, x, y, w, h);
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, Math.max(w / 2, 0.5), Math.max(h / 2, 0.5), 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (node.type === 'text') {
    ctx.translate(x, y);
    ctx.scale(v.scale, v.scale);
    makeFill(ctx, node, 0, 0, node.w, node.h);
    const fs = Math.max(1, node.fontSize ?? 24);
    const weight = node.fontWeight ?? 500;
    const family = node.fontFamily ?? '"Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif';
    ctx.font = `${node.italic ? 'italic ' : ''}${weight} ${fs}px ${family}`;
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${node.letterSpacing ?? 0}px`;
    ctx.textBaseline = 'top';
    ctx.textAlign = node.align === 'center' ? 'center' : node.align === 'right' ? 'right' : 'left';
    ctx.beginPath();
    ctx.rect(0, 0, Math.max(node.w, 1), Math.max(node.h, 1));
    ctx.clip();
    const lines = (node.text ?? '文本').split('\n');
    const lineHeight = fs * (node.lineHeight ?? 1.3);
    const step = lineHeight + (node.paragraphSpacing ?? 0);
    lines.forEach((line, i) => {
      const display = node.listStyle === 'bullet' ? `•  ${line}` : node.listStyle === 'number' ? `${i + 1}.  ${line}` : line;
      const lineX = node.align === 'center' ? node.w / 2 : node.align === 'right' ? node.w : 0;
      ctx.fillText(display, lineX, i * step);
    });
    if (paintStroke(ctx, node)) {
      ctx.strokeText(node.text ?? '文本', node.align === 'center' ? node.w / 2 : node.align === 'right' ? node.w : 0, 0);
    }
  } else {
    if (!drawShapeImageFill(ctx, doc, node, x, y, w, h, v)) {
      makeFill(ctx, node, x, y, w, h);
      roundRect(ctx, x, y, w, h, node.cornerRadius * v.scale);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawVectorPath(
  ctx: CanvasRenderingContext2D,
  doc: GromaDoc,
  node: SceneNode,
  ox: number,
  oy: number,
  v: Viewport,
) {
  if (!node.pathData) return;
  const x = (ox + node.x) * v.scale + v.x;
  const y = (oy + node.y) * v.scale + v.y;
  const sourceW = Math.max(0.01, node.pathW ?? node.w);
  const sourceH = Math.max(0.01, node.pathH ?? node.h);
  const sx = (node.w / sourceW) * v.scale;
  const sy = (node.h / sourceH) * v.scale;

  ctx.save();
  ctx.globalAlpha = node.opacity;
  ctx.translate(x, y);
  ctx.scale(sx, sy);
  const contours = node.pathContours?.length ? nodePathContours(node) : [];
  if (contours.length > 0) {
    const closed = contours.filter((contour) => contour.closed && contour.anchors.length >= 3);
    const closedData = closed.map((contour) => penPathData(contour.anchors, true)).filter(Boolean).join(' ');
    const allData = contours.map((contour) => penPathData(contour.anchors, contour.closed)).filter(Boolean).join(' ');
    if ((node.fills.length > 0 || node.imageFill) && closedData) {
      const path = new Path2D(closedData);
      if (!drawPathImageFill(ctx, doc, node, sourceW, sourceH, path, node.fillRule ?? 'nonzero')) {
        makeFill(ctx, node, 0, 0, sourceW, sourceH);
        ctx.fill(path, node.fillRule ?? 'nonzero');
      }
    }
    if (paintStroke(ctx, node) && allData) {
      ctx.stroke(new Path2D(allData));
      const head = node.shapeKind === 'arrow' ? node.arrowHeadData : undefined;
      const stroke = node.strokes?.[0];
      if (head && stroke) {
        ctx.fillStyle = stroke.color;
        ctx.fill(new Path2D(head));
      }
    }
    ctx.restore();
    return;
  }
  const path = new Path2D(node.pathData);
  if (node.fills.length > 0 || node.imageFill) {
    if (!drawPathImageFill(ctx, doc, node, sourceW, sourceH, path, node.fillRule ?? 'nonzero')) {
      makeFill(ctx, node, 0, 0, sourceW, sourceH);
      ctx.fill(path, node.fillRule ?? 'nonzero');
    }
  }
  if (paintStroke(ctx, node)) {
    ctx.stroke(path);
    const head = node.shapeKind === 'arrow' ? node.arrowHeadData : undefined;
    const stroke = node.strokes?.[0];
    if (head && stroke) {
      ctx.fillStyle = stroke.color;
      ctx.fill(new Path2D(head));
    }
  }
  ctx.restore();
}

function drawImageNode(
  ctx: CanvasRenderingContext2D,
  doc: GromaDoc,
  node: SceneNode,
  ox: number,
  oy: number,
  v: Viewport,
  cropPreviewId?: string | null,
) {
  const x = (ox + node.x) * v.scale + v.x;
  const y = (oy + node.y) * v.scale + v.y;
  const w = node.w * v.scale;
  const h = node.h * v.scale;
  const asset = node.assetId ? doc.assets?.[node.assetId] : undefined;
  const image = asset ? getAssetImage(asset.id) : null;

  ctx.save();
  ctx.globalAlpha = node.opacity;
  if (node.cornerRadius > 0) {
    roundRect(ctx, x, y, w, h, node.cornerRadius * v.scale);
    ctx.clip();
  }
  if (image && image.naturalWidth > 0 && image.naturalHeight > 0) {
    const crop = cropPreviewId === node.id ? FULL_IMAGE_CROP : imageCropOf(node);
    const source = imageSourceRect(image.naturalWidth, image.naturalHeight, crop);
    ctx.drawImage(image, source.x, source.y, source.w, source.h, x, y, w, h);
  } else {
    ctx.fillStyle = '#F1EFE9';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(34, 28, 0, 0.22)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, h - 1));
    if (w > 52 && h > 22) {
      ctx.setLineDash([]);
      ctx.fillStyle = '#6D685E';
      ctx.font = '11px "Segoe UI", "Microsoft YaHei UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(asset ? '图片加载中' : '图片缺失', x + w / 2, y + h / 2, Math.max(1, w - 12));
    }
    if (asset) requestImageAsset(asset);
  }
  ctx.restore();

  const stroke = node.strokes?.[0];
  if (stroke && stroke.width > 0 && stroke.opacity > 0) {
    ctx.save();
    ctx.globalAlpha = node.opacity * stroke.opacity;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width * v.scale;
    ctx.lineCap = stroke.cap;
    ctx.lineJoin = stroke.join;
    if (stroke.dash.length > 0) ctx.setLineDash(stroke.dash.map((dash) => dash * v.scale));
    roundRect(ctx, x, y, w, h, node.cornerRadius * v.scale);
    ctx.stroke();
    ctx.restore();
  }
}

function drawSlice(
  ctx: CanvasRenderingContext2D,
  node: SceneNode,
  ox: number,
  oy: number,
  v: Viewport,
  opts: InternalDrawOptions,
) {
  if (opts.exporting) return;
  const x = (ox + node.x) * v.scale + v.x;
  const y = (oy + node.y) * v.scale + v.y;
  const w = node.w * v.scale;
  const h = node.h * v.scale;
  if (w < 2 || h < 2) return;

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(15, 118, 110, 0.055)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#0F766E';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(x + 0.5, y + 0.5, Math.max(1, w - 1), Math.max(1, h - 1));
  ctx.setLineDash([]);

  if (v.scale >= 0.24) {
    const label = node.name;
    ctx.font = '600 11px "Segoe UI", "Microsoft YaHei UI", sans-serif';
    const labelW = Math.min(Math.max(48, ctx.measureText(label).width + 14), Math.max(1, w - 8));
    const labelH = 17;
    if (w > 60 && h > 28) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fillRect(x + 5, y + 5, labelW, labelH);
      ctx.strokeStyle = 'rgba(15, 118, 110, 0.42)';
      ctx.strokeRect(x + 5.5, y + 5.5, Math.max(1, labelW - 1), labelH - 1);
      ctx.fillStyle = '#0F766E';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(label, x + 10, y + 14);
    }
  }
  ctx.restore();
}

function clipToMask(
  ctx: CanvasRenderingContext2D,
  doc: GromaDoc,
  mask: SceneNode,
  v: Viewport,
  ox: number,
  oy: number,
): boolean {
  const rings = nodeWorldRings(doc, mask);
  if (rings.length === 0) return false;
  const path = new Path2D();
  for (const ring of rings) {
    if (ring.length < 3) continue;
    path.moveTo((ring[0][0] + ox) * v.scale + v.x, (ring[0][1] + oy) * v.scale + v.y);
    for (let index = 1; index < ring.length; index += 1) {
      path.lineTo((ring[index][0] + ox) * v.scale + v.x, (ring[index][1] + oy) * v.scale + v.y);
    }
    path.closePath();
  }
  ctx.clip(path, 'evenodd');
  return true;
}

function luminanceToAlpha(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3] / 255;
    const luminance = (0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]) / 255;
    data[index] = 0;
    data[index + 1] = 0;
    data[index + 2] = 0;
    data[index + 3] = Math.round(255 * luminance * alpha);
  }
  ctx.putImageData(image, 0, 0);
}

/** Alpha/亮度蒙版需要先把上方兄弟画进离屏层，再按蒙版像素做 destination-in。 */
interface MaskCanvasSlot {
  layer: HTMLCanvasElement;
  mask: HTMLCanvasElement;
  width: number;
  height: number;
}

/**
 * 离屏层按容器深度复用：同一帧不会为每个蒙版反复分配整张窗口大小的 canvas；
 * 嵌套蒙版由更深一层拿到独立槽位，不会互相覆盖。
 */
const maskCanvasSlots = new Map<number, MaskCanvasSlot>();

function maskCanvasSlot(depth: number, width: number, height: number): MaskCanvasSlot {
  let slot = maskCanvasSlots.get(depth);
  if (!slot) {
    slot = {
      layer: document.createElement('canvas'),
      mask: document.createElement('canvas'),
      width: 0,
      height: 0,
    };
    maskCanvasSlots.set(depth, slot);
  }
  if (slot.width !== width || slot.height !== height) {
    slot.layer.width = width;
    slot.layer.height = height;
    slot.mask.width = width;
    slot.mask.height = height;
    slot.width = width;
    slot.height = height;
  }
  for (const canvas of [slot.layer, slot.mask]) {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('离屏蒙版 canvas 不可用');
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
    context.clearRect(0, 0, width, height);
  }
  return slot;
}

function drawPixelMaskedChildren(
  ctx: CanvasRenderingContext2D,
  doc: GromaDoc,
  parent: SceneNode,
  mask: SceneNode,
  startIndex: number,
  ox: number,
  oy: number,
  v: Viewport,
  opts: InternalDrawOptions,
  bounds: WorldBounds | null | undefined,
  depth: number,
): boolean {
  const source = ctx.canvas;
  if (!source || typeof document === 'undefined' || typeof ctx.getTransform !== 'function') return false;
  const width = source.width;
  const height = source.height;
  if (width <= 0 || height <= 0) return false;

  let slot: MaskCanvasSlot;
  try {
    slot = maskCanvasSlot(depth, width, height);
  } catch {
    return false;
  }
  const transform = ctx.getTransform();
  const layerCtx = slot.layer.getContext('2d', { willReadFrequently: true });
  const maskCtx = slot.mask.getContext('2d', { willReadFrequently: true });
  if (!layerCtx || !maskCtx) return false;
  layerCtx.setTransform(transform);
  layerCtx.globalAlpha = ctx.globalAlpha;
  for (let index = startIndex; index < parent.children.length; index += 1) {
    const child = doc.nodes[parent.children[index]];
    if (!child || child.isMask) continue;
    drawNode(layerCtx, doc, child, ox, oy, v, opts, bounds, depth);
  }

  maskCtx.setTransform(transform);
  drawNode(maskCtx, doc, mask, ox, oy, v, opts, bounds, depth);
  if (maskTypeOf(mask) === 'luminance') luminanceToAlpha(maskCtx, width, height);

  layerCtx.setTransform(1, 0, 0, 1, 0, 0);
  layerCtx.globalCompositeOperation = 'destination-in';
  layerCtx.drawImage(slot.mask, 0, 0);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(slot.layer, 0, 0);
  ctx.restore();
  return true;
}

function drawChildren(
  ctx: CanvasRenderingContext2D,
  doc: GromaDoc,
  node: SceneNode,
  ox: number,
  oy: number,
  v: Viewport,
  opts: InternalDrawOptions,
  bounds: WorldBounds | null | undefined,
  depth: number,
) {
  if (depth >= (opts.maxDepth ?? Infinity)) return;
  const maskIndex = maskIndexForParent(doc, node);
  const edge = maskIndex >= 0 ? maskIndex : node.children.length;
  for (let index = 0; index < edge; index += 1) {
    const child = doc.nodes[node.children[index]];
    if (!child || child.isMask) continue;
    drawNode(ctx, doc, child, ox, oy, v, opts, bounds, depth);
  }
  if (maskIndex < 0) return;
  const mask = doc.nodes[node.children[maskIndex]];
  if (!mask) return;
  ctx.save();
  const pixelMasked =
    maskTypeOf(mask) !== 'geometry' &&
    drawPixelMaskedChildren(ctx, doc, node, mask, maskIndex + 1, ox, oy, v, opts, bounds, depth);
  if (!pixelMasked) {
    clipToMask(ctx, doc, mask, v, ox, oy);
    for (let index = maskIndex + 1; index < node.children.length; index += 1) {
      const child = doc.nodes[node.children[index]];
      if (!child || child.isMask) continue;
      drawNode(ctx, doc, child, ox, oy, v, opts, bounds, depth);
    }
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
  } else if (node.type === 'slice') {
    drawSlice(ctx, node, ox, oy, v, opts);
  } else if (node.type === 'path') {
    drawVectorPath(ctx, doc, node, ox, oy, v);
  } else if (node.type === 'image') {
    drawImageNode(ctx, doc, node, ox, oy, v, opts.cropPreviewId);
  } else if (node.type === 'rect' || node.type === 'ellipse' || node.type === 'text') {
    drawShape(ctx, doc, node, ox, oy, v);
  } else if (depth < (opts.maxDepth ?? Infinity)) {
    ctx.save();
    ctx.globalAlpha = node.opacity;
    drawChildren(ctx, doc, node, ox + node.x, oy + node.y, v, opts, bounds, depth + 1);
    ctx.restore();
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
  const opts: InternalDrawOptions = {
    interactive: options?.interactive === true,
    cropPreviewId: options?.cropPreviewId ?? null,
    stats,
  };
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
    const index = frameIndexFor(doc, root);
    const visible = index ? visibleFrameOrders(index, bounds, v) : null;
    if (visible !== null) {
      for (const id of visible) {
        const node = doc.nodes[id];
        if (node) drawNode(ctx, doc, node, 0, 0, v, opts, bounds);
      }
    } else {
      drawChildren(ctx, doc, root, 0, 0, v, opts, bounds, 0);
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
  const exportOpts: InternalDrawOptions = { interactive: false, exporting: true, stats: newStats() };
  drawChildren(ctx, doc, frame, 0, 0, { x: 0, y: 0, scale: 1 }, exportOpts, undefined, 0);
  ctx.restore();

  return {
    dataUrl: mime === 'image/jpeg' ? canvas.toDataURL('image/jpeg', quality) : canvas.toDataURL('image/png'),
    width: frame.w,
    height: frame.h,
    scale: safeScale,
  };
}

/**
 * 切片只导出矩形内的画面，不把切片自己的虚线标记画进去。
 * 从页面根节点重绘，因此切片落在画板内或直接落在画布上都能取到下面真实内容。
 */
function renderSliceRaster(
  doc: GromaDoc,
  sliceId: string,
  scale: number,
  transparent: boolean,
  mime: 'image/png' | 'image/jpeg',
  quality = 0.92,
): FrameExport | null {
  const slice = doc.nodes[sliceId];
  if (!slice || slice.type !== 'slice') return null;
  const root = pageRootOf(doc, sliceId);
  if (!root) return null;
  const region = absoluteRect(doc, sliceId);
  const safeScale = Math.max(0.5, Math.min(4, scale));
  const width = Math.max(1, Math.round(region.w * safeScale));
  const height = Math.max(1, Math.round(region.h * safeScale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.setTransform(safeScale, 0, 0, safeScale, 0, 0);
  const opaque = !transparent || mime === 'image/jpeg';
  if (opaque) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, region.w, region.h);
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, region.w, region.h);
  ctx.clip();
  const exportOpts: InternalDrawOptions = { interactive: false, hideChrome: true, exporting: true, stats: newStats() };
  drawChildren(ctx, doc, root, -region.x, -region.y, { x: 0, y: 0, scale: 1 }, exportOpts, undefined, 0);
  ctx.restore();

  return {
    dataUrl: mime === 'image/jpeg' ? canvas.toDataURL('image/jpeg', quality) : canvas.toDataURL('image/png'),
    width: region.w,
    height: region.h,
    scale: safeScale,
  };
}

export function renderSlicePng(
  doc: GromaDoc,
  sliceId: string,
  scale: number,
  transparent: boolean,
): FrameExport | null {
  return renderSliceRaster(doc, sliceId, scale, transparent, 'image/png');
}

export function renderSliceJpg(
  doc: GromaDoc,
  sliceId: string,
  scale: number,
  transparent: boolean,
): FrameExport | null {
  return renderSliceRaster(doc, sliceId, scale, transparent, 'image/jpeg');
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
 * 导出单个图层（形状、钢笔、文本、图片、组合等），以该图层自身包围盒为零点。
 * 画板/区块/切片继续走原有专用导出，保证背景与裁剪语义不变。
 */
function renderNodeRaster(
  doc: GromaDoc,
  nodeId: string,
  scale: number,
  transparent: boolean,
): FrameExport | null {
  const node = doc.nodes[nodeId];
  if (!node || node.type === 'page' || node.type === 'slice' || node.type === 'frame' || node.type === 'section') return null;
  const region = absoluteRect(doc, nodeId);
  const safeScale = Math.max(0.5, Math.min(4, scale));
  const width = Math.max(1, Math.round(region.w * safeScale));
  const height = Math.max(1, Math.round(region.h * safeScale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.setTransform(safeScale, 0, 0, safeScale, 0, 0);
  if (!transparent) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, region.w, region.h);
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, region.w, region.h);
  ctx.clip();
  const exportOpts: InternalDrawOptions = { interactive: false, hideChrome: true, exporting: true, stats: newStats() };
  drawNode(ctx, doc, node, -region.x, -region.y, { x: 0, y: 0, scale: 1 }, exportOpts);
  ctx.restore();
  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: region.w,
    height: region.h,
    scale: safeScale,
  };
}

export function renderNodePng(
  doc: GromaDoc,
  nodeId: string,
  scale: number,
  transparent: boolean,
): FrameExport | null {
  return renderNodeRaster(doc, nodeId, scale, transparent);
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
    exporting: true,
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
