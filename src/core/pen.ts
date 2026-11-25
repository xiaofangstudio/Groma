import type { PathAnchor, PathContour, SceneNode } from './types';

/** 钢笔绘制时的锚点，坐标与调用方传入的坐标系一致（画布用世界坐标）。 */
export interface PenAnchor {
  x: number;
  y: number;
  inX?: number;
  inY?: number;
  outX?: number;
  outY?: number;
  vertexId?: string;
}

export interface PenGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
  pathData: string;
  pathW: number;
  pathH: number;
  anchors: PathAnchor[];
  closed: boolean;
}

/** 一条连续轮廓；同一节点可有多个轮廓。 */
export interface PenContour {
  anchors: PenAnchor[];
  closed: boolean;
}

export interface PenContoursGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
  pathData: string;
  pathW: number;
  pathH: number;
  contours: PathContour[];
}

export interface PathHit {
  segment: number;
  t: number;
  x: number;
  y: number;
  distance: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpPoint = (a: { x: number; y: number }, b: { x: number; y: number }, t: number) => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
});

function cubicPoint(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number,
): { x: number; y: number } {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

function segmentCurve(a: PenAnchor, b: PenAnchor) {
  const aOut = outPoint(a);
  const bIn = inPoint(b);
  const curved = dist(aOut, a) > 0.01 || dist(bIn, b) > 0.01;
  return {
    curved,
    p0: { x: a.x, y: a.y },
    p1: curved ? aOut : { x: a.x, y: a.y },
    p2: curved ? bIn : { x: b.x, y: b.y },
    p3: { x: b.x, y: b.y },
  };
}

function pathSegments(anchors: PenAnchor[], closed: boolean): Array<[PenAnchor, PenAnchor]> {
  const segments: Array<[PenAnchor, PenAnchor]> = [];
  for (let i = 1; i < anchors.length; i += 1) segments.push([anchors[i - 1], anchors[i]]);
  if (closed && anchors.length >= 3) segments.push([anchors[anchors.length - 1], anchors[0]]);
  return segments;
}

/**
 * 找到指针离路径最近的一段与参数 t。折线按线性参数采样，贝塞尔按三次曲线采样；
 * 32 段足以让 8px 命中判断稳定，也避免每次鼠标移动都做重计算。
 */
export function nearestOnPenPath(
  anchors: PenAnchor[],
  closed: boolean,
  point: { x: number; y: number },
  steps = 32,
): PathHit | null {
  if (anchors.length < 2) return null;
  let best: PathHit | null = null;
  const segments = pathSegments(anchors, closed);
  for (let segment = 0; segment < segments.length; segment += 1) {
    const [start, end] = segments[segment];
    const curve = segmentCurve(start, end);
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const sample = curve.curved
        ? cubicPoint(curve.p0, curve.p1, curve.p2, curve.p3, t)
        : lerpPoint(curve.p0, curve.p3, t);
      const candidate = {
        segment,
        t,
        x: sample.x,
        y: sample.y,
        distance: Math.hypot(sample.x - point.x, sample.y - point.y),
      };
      if (!best || candidate.distance < best.distance) best = candidate;
    }
  }
  return best;
}

/**
 * 在线段上插入锚点。贝塞尔段用 De Casteljau 在 t 处切分，并同步改写两端手柄，
 * 保证插入后曲线形状不变；直线段只插入一个无手柄角点。
 */
export function insertPenAnchor(
  anchors: PenAnchor[],
  closed: boolean,
  segment: number,
  t: number,
): PenAnchor[] {
  if (anchors.length < 2) return anchors.map((anchor) => ({ ...anchor }));
  const segments = pathSegments(anchors, closed);
  const pair = segments[segment];
  if (!pair) return anchors.map((anchor) => ({ ...anchor }));
  const startIndex = segment;
  const endIndex = segment + 1 >= anchors.length ? 0 : segment + 1;
  const next = anchors.map((anchor) => ({
    x: anchor.x,
    y: anchor.y,
    inX: anchor.inX ?? anchor.x,
    inY: anchor.inY ?? anchor.y,
    outX: anchor.outX ?? anchor.x,
    outY: anchor.outY ?? anchor.y,
    ...(anchor.vertexId ? { vertexId: anchor.vertexId } : {}),
  })) as PathAnchor[];
  const start = next[startIndex];
  const end = next[endIndex];
  const curve = segmentCurve(start, end);
  const clamped = Math.min(1, Math.max(0, t));
  let inserted: PathAnchor;
  if (curve.curved) {
    const p01 = lerpPoint(curve.p0, curve.p1, clamped);
    const p12 = lerpPoint(curve.p1, curve.p2, clamped);
    const p23 = lerpPoint(curve.p2, curve.p3, clamped);
    const p012 = lerpPoint(p01, p12, clamped);
    const p123 = lerpPoint(p12, p23, clamped);
    const split = lerpPoint(p012, p123, clamped);
    start.outX = r2(p01.x);
    start.outY = r2(p01.y);
    end.inX = r2(p23.x);
    end.inY = r2(p23.y);
    inserted = {
      x: r2(split.x),
      y: r2(split.y),
      inX: r2(p012.x),
      inY: r2(p012.y),
      outX: r2(p123.x),
      outY: r2(p123.y),
    };
  } else {
    const split = lerpPoint(curve.p0, curve.p3, clamped);
    inserted = {
      x: r2(split.x),
      y: r2(split.y),
      inX: r2(split.x),
      inY: r2(split.y),
      outX: r2(split.x),
      outY: r2(split.y),
    };
  }
  next.splice(startIndex + 1, 0, inserted);
  return next;
}

export function removePenAnchor(anchors: PenAnchor[], index: number): PenAnchor[] | null {
  if (index < 0 || index >= anchors.length || anchors.length <= 2) return null;
  return anchors.filter((_, itemIndex) => itemIndex !== index).map((anchor) => ({ ...anchor }));
}

/** 同 vertexId 的锚点共享位置与手柄；把源锚点几何复制到所有引用。 */
export function syncSharedPenVertex(
  contours: PenContour[],
  source: { contour: number; index: number },
): PenContour[] {
  const anchor = contours[source.contour]?.anchors[source.index];
  const id = anchor?.vertexId;
  return contours.map((contour) => ({
    closed: contour.closed,
    anchors: contour.anchors.map((item) => {
      if (!id || item.vertexId !== id) return { ...item };
      return {
        x: anchor.x,
        y: anchor.y,
        inX: anchor.inX ?? anchor.x,
        inY: anchor.inY ?? anchor.y,
        outX: anchor.outX ?? anchor.x,
        outY: anchor.outY ?? anchor.y,
        vertexId: id,
      };
    }),
  }));
}

/**
 * 删除一个顶点：有 vertexId 时从所有轮廓中移除同 id 锚点；
 * 某条轮廓不足 2 锚点则整条移除，全部轮廓都不够时返回 null。
 */
export function removePenVertex(
  contours: PenContour[],
  source: { contour: number; index: number },
): PenContour[] | null {
  const contour = contours[source.contour];
  const anchor = contour?.anchors[source.index];
  if (!contour || !anchor) return null;
  const id = anchor.vertexId;
  if (!id) {
    const next = removePenAnchor(contour.anchors, source.index);
    if (!next) return null;
    if (next.length >= 2) {
      return contours.map((item, index) =>
        index === source.contour ? { closed: item.closed, anchors: next } : { closed: item.closed, anchors: item.anchors.map((a) => ({ ...a })) },
      );
    }
    if (contours.length <= 1) return null;
    return contours
      .filter((_, index) => index !== source.contour)
      .map((item) => ({ closed: item.closed, anchors: item.anchors.map((a) => ({ ...a })) }));
  }
  const trimmed = contours
    .map((item) => ({
      closed: item.closed,
      anchors: item.anchors.filter((a) => a.vertexId !== id).map((a) => ({ ...a })),
    }))
    .filter((item) => item.anchors.length >= 2);
  return trimmed.length > 0 ? trimmed : null;
}

/** 统计被多条轮廓引用的共享顶点数，用于右栏只读反馈。 */
export function countSharedPenVertices(contours: PenContour[]): number {
  const counts = new Map<string, number>();
  for (const contour of contours) {
    for (const anchor of contour.anchors) {
      if (!anchor.vertexId) continue;
      counts.set(anchor.vertexId, (counts.get(anchor.vertexId) ?? 0) + 1);
    }
  }
  let shared = 0;
  for (const count of counts.values()) if (count > 1) shared += 1;
  return shared;
}

/** 有任一非零手柄视为平滑点；双击在平滑 / 角点之间切换。 */
export function isSmoothPenAnchor(anchor: PenAnchor): boolean {
  return dist(inPoint(anchor), anchor) > 0.01 || dist(outPoint(anchor), anchor) > 0.01;
}

/**
 * 在角点与平滑点之间切换。平滑点按前后锚点连线取切线，两侧手柄等长；
 * 开放路径端点只看向唯一邻居，闭合路径两端环绕。返回新数组，不改原对象。
 */
export function togglePenAnchorType(
  anchors: PenAnchor[],
  closed: boolean,
  index: number,
): { anchors: PenAnchor[]; smooth: boolean } | null {
  if (index < 0 || index >= anchors.length) return null;
  const next = anchors.map((anchor) => ({
    x: anchor.x,
    y: anchor.y,
    inX: anchor.inX ?? anchor.x,
    inY: anchor.inY ?? anchor.y,
    outX: anchor.outX ?? anchor.x,
    outY: anchor.outY ?? anchor.y,
    ...(anchor.vertexId ? { vertexId: anchor.vertexId } : {}),
  }));
  const target = next[index];
  const smooth = !isSmoothPenAnchor(target);
  if (!smooth) {
    target.inX = target.x;
    target.inY = target.y;
    target.outX = target.x;
    target.outY = target.y;
    return { anchors: next, smooth: false };
  }
  const count = next.length;
  const hasPrev = closed || index > 0;
  const hasNext = closed || index < count - 1;
  const prev = hasPrev ? next[(index - 1 + count) % count] : null;
  const after = hasNext ? next[(index + 1) % count] : null;
  const prevDist = prev ? Math.hypot(prev.x - target.x, prev.y - target.y) : 0;
  const nextDist = after ? Math.hypot(after.x - target.x, after.y - target.y) : 0;
  let tx = 1;
  let ty = 0;
  if (prev && after) {
    tx = after.x - prev.x;
    ty = after.y - prev.y;
  } else if (after) {
    tx = after.x - target.x;
    ty = after.y - target.y;
  } else if (prev) {
    tx = target.x - prev.x;
    ty = target.y - prev.y;
  }
  const tangent = Math.hypot(tx, ty);
  if (tangent > 0.01) {
    tx /= tangent;
    ty /= tangent;
  } else {
    tx = 1;
    ty = 0;
  }
  const length = Math.max(4, Math.min(prevDist || Infinity, nextDist || Infinity) * 0.33);
  target.inX = r2(target.x - tx * length);
  target.inY = r2(target.y - ty * length);
  target.outX = r2(target.x + tx * length);
  target.outY = r2(target.y + ty * length);
  return { anchors: next, smooth: true };
}

/** 把节点局部锚点还原为世界坐标，包含节点被缩放后的 sx/sy 映射。 */
export function pathAnchorsToWorld(node: SceneNode, origin: { x: number; y: number }): PenAnchor[] {
  if (!node.pathAnchors || node.pathAnchors.length === 0) return [];
  const sx = node.w / Math.max(0.01, node.pathW ?? node.w);
  const sy = node.h / Math.max(0.01, node.pathH ?? node.h);
  return node.pathAnchors.map((anchor) => ({
    x: origin.x + anchor.x * sx,
    y: origin.y + anchor.y * sy,
    inX: origin.x + anchor.inX * sx,
    inY: origin.y + anchor.inY * sy,
    outX: origin.x + anchor.outX * sx,
    outY: origin.y + anchor.outY * sy,
    ...(anchor.vertexId ? { vertexId: anchor.vertexId } : {}),
  }));
}


function r2(value: number): number {
  return Math.round(value * 100) / 100;
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function inPoint(anchor: PenAnchor): { x: number; y: number } {
  return {
    x: anchor.inX ?? anchor.x,
    y: anchor.inY ?? anchor.y,
  };
}

function outPoint(anchor: PenAnchor): { x: number; y: number } {
  return {
    x: anchor.outX ?? anchor.x,
    y: anchor.outY ?? anchor.y,
  };
}

function segment(a: PenAnchor, b: PenAnchor): string {
  const aOut = outPoint(a);
  const bIn = inPoint(b);
  const curved = dist(aOut, a) > 0.01 || dist(bIn, b) > 0.01;
  if (!curved) return `L ${r2(b.x)} ${r2(b.y)}`;
  return `C ${r2(aOut.x)} ${r2(aOut.y)} ${r2(bIn.x)} ${r2(bIn.y)} ${r2(b.x)} ${r2(b.y)}`;
}

/**
 * 把锚点连成 SVG path。相邻锚点任一有手柄时使用三次贝塞尔，否则用直线。
 * 闭合路径补最后一段并加 Z；少于 3 个锚点时不闭合，避免生成退化形状。
 */
export function penPathData(anchors: PenAnchor[], closed = false): string {
  if (anchors.length === 0) return '';
  const parts = [`M ${r2(anchors[0].x)} ${r2(anchors[0].y)}`];
  for (let i = 1; i < anchors.length; i += 1) parts.push(segment(anchors[i - 1], anchors[i]));
  const shouldClose = closed && anchors.length >= 3;
  if (shouldClose) {
    parts.push(segment(anchors[anchors.length - 1], anchors[0]));
    parts.push('Z');
  }
  return parts.join(' ');
}

/**
 * 把世界坐标锚点归一到节点局部坐标。包围盒包含手柄控制点，
 * 因此选择框一定包住整条贝塞尔曲线，不会出现手柄露在节点外。
 * 多轮廓共享同一个包围盒原点，轮廓之间的相对位置不会因归一化漂移。
 */
export function penContoursGeometry(contours: PenContour[]): PenContoursGeometry | null {
  const valid = contours.filter((contour) => contour.anchors.length >= 2);
  if (valid.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const contour of valid) {
    for (const anchor of contour.anchors) {
      for (const point of [anchor, inPoint(anchor), outPoint(anchor)]) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }
    }
  }
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  const localContours: PathContour[] = valid.map((contour) => {
    const anchors: PathAnchor[] = contour.anchors.map((anchor) => {
      const pin = inPoint(anchor);
      const pout = outPoint(anchor);
      return {
        x: r2(anchor.x - minX),
        y: r2(anchor.y - minY),
        inX: r2(pin.x - minX),
        inY: r2(pin.y - minY),
        outX: r2(pout.x - minX),
        outY: r2(pout.y - minY),
        ...(anchor.vertexId ? { vertexId: anchor.vertexId } : {}),
      };
    });
    return { anchors, closed: contour.closed && anchors.length >= 3 };
  });
  return {
    x: minX,
    y: minY,
    w,
    h,
    pathData: localContours.map((contour) => penPathData(contour.anchors, contour.closed)).join(' '),
    pathW: w,
    pathH: h,
    contours: localContours,
  };
}

export function penGeometry(anchors: PenAnchor[], closed = false): PenGeometry | null {
  const geometry = penContoursGeometry([{ anchors, closed }]);
  if (!geometry) return null;
  const first = geometry.contours[0];
  return {
    x: geometry.x,
    y: geometry.y,
    w: geometry.w,
    h: geometry.h,
    pathData: geometry.pathData,
    pathW: geometry.pathW,
    pathH: geometry.pathH,
    anchors: first.anchors,
    closed: first.closed,
  };
}

/** 读取节点上的全部轮廓；旧单轮廓节点自动包装成一条。 */
export function nodePathContours(node: SceneNode): PathContour[] {
  if (node.pathContours?.length) {
    return node.pathContours.map((contour) => ({
      anchors: contour.anchors.map((anchor) => ({ ...anchor })),
      closed: contour.closed,
    }));
  }
  if (node.pathAnchors?.length) {
    return [{ anchors: node.pathAnchors.map((anchor) => ({ ...anchor })), closed: Boolean(node.pathClosed) }];
  }
  return [];
}

/** 把节点局部轮廓还原成世界坐标；节点被缩放时按 w/pathW、h/pathH 映射。 */
export function pathContoursToWorld(node: SceneNode, origin: { x: number; y: number }): PenContour[] {
  const sx = node.w / Math.max(0.01, node.pathW ?? node.w);
  const sy = node.h / Math.max(0.01, node.pathH ?? node.h);
  return nodePathContours(node).map((contour) => ({
    closed: contour.closed,
    anchors: contour.anchors.map((anchor) => ({
      x: origin.x + anchor.x * sx,
      y: origin.y + anchor.y * sy,
      inX: origin.x + anchor.inX * sx,
      inY: origin.y + anchor.inY * sy,
      outX: origin.x + anchor.outX * sx,
      outY: origin.y + anchor.outY * sy,
      ...(anchor.vertexId ? { vertexId: anchor.vertexId } : {}),
    })),
  }));
}
