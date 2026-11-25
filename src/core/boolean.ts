import polygonClipping, { type MultiPolygon, type Polygon, type Ring } from 'polygon-clipping';
import { absolutePosition } from './geometry';
import { penContoursGeometry, pathContoursToWorld, type PenAnchor } from './pen';
import type { GromaDoc, Paint, PathContour, SceneNode, Stroke, StrokeJoin } from './types';

export type BooleanOp = 'union' | 'subtract' | 'intersect' | 'exclude';
export type VectorAction = BooleanOp | 'divide' | 'flatten' | 'outline';

export interface BooleanPathBuild {
  node: SceneNode;
  sourceIds: string[];
  parentId: string;
}

export interface VectorBuild {
  nodes: SceneNode[];
  sourceIds: string[];
  removeSourceIds: string[];
  sourcePatches: Record<string, SceneNode>;
  parentId: string;
  replaceSources: boolean;
}

export interface BooleanEligibility {
  ok: boolean;
  reason: string;
}

const BOOLEAN_PREFIX: Record<BooleanOp, string> = {
  union: '并集',
  subtract: '差集',
  intersect: '交集',
  exclude: '排除',
};

const ACTION_PREFIX: Record<VectorAction, string> = {
  ...BOOLEAN_PREFIX,
  divide: '分割',
  flatten: '拍平',
  outline: '描边',
};

const MAX_DIVIDE_INPUTS = 8;

const CURVE_STEPS = 12;
const ELLIPSE_STEPS = 48;

type Point = { x: number; y: number };

function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;
}

function cubicPoint(a: Point, b: Point, c: Point, d: Point, t: number): Point {
  const k = 1 - t;
  return {
    x: k * k * k * a.x + 3 * k * k * t * b.x + 3 * k * t * t * c.x + t * t * t * d.x,
    y: k * k * k * a.y + 3 * k * k * t * b.y + 3 * k * t * t * c.y + t * t * t * d.y,
  };
}

function flattenClosedContour(anchors: PenAnchor[]): Ring {
  if (anchors.length < 3) return [];
  const points: Point[] = [{ x: anchors[0].x, y: anchors[0].y }];
  for (let index = 0; index < anchors.length; index += 1) {
    const start = anchors[index];
    const end = anchors[(index + 1) % anchors.length];
    const c1 = { x: start.outX ?? start.x, y: start.outY ?? start.y };
    const c2 = { x: end.inX ?? end.x, y: end.inY ?? end.y };
    const curved = !samePoint(c1, start) || !samePoint(c2, end);
    if (curved) {
      for (let step = 1; step <= CURVE_STEPS; step += 1) {
        points.push(cubicPoint(start, c1, c2, end, step / CURVE_STEPS));
      }
    } else {
      points.push({ x: end.x, y: end.y });
    }
  }
  const ring = points.map((point) => [point.x, point.y] as [number, number]);
  if (ring.length > 1 && samePoint({ x: ring[0][0], y: ring[0][1] }, { x: ring[ring.length - 1][0], y: ring[ring.length - 1][1] })) {
    ring.pop();
  }
  return ring;
}

function rectRing(node: SceneNode, origin: { x: number; y: number }): Ring {
  const w = Math.max(0.01, node.w);
  const h = Math.max(0.01, node.h);
  const radius = Math.max(0, Math.min(node.cornerRadius ?? 0, w / 2, h / 2));
  if (radius <= 0.01) {
    return [
      [origin.x, origin.y],
      [origin.x + w, origin.y],
      [origin.x + w, origin.y + h],
      [origin.x, origin.y + h],
    ];
  }
  const points: Array<[number, number]> = [];
  const corner = (cx: number, cy: number, start: number) => {
    for (let step = 0; step <= 6; step += 1) {
      const angle = start + (step * Math.PI) / 12;
      points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
    }
  };
  corner(origin.x + w - radius, origin.y + radius, -Math.PI / 2);
  corner(origin.x + w - radius, origin.y + h - radius, 0);
  corner(origin.x + radius, origin.y + h - radius, Math.PI / 2);
  corner(origin.x + radius, origin.y + radius, Math.PI);
  return points;
}

function ellipseRing(node: SceneNode, origin: { x: number; y: number }): Ring {
  const rx = Math.max(0.01, node.w / 2);
  const ry = Math.max(0.01, node.h / 2);
  const cx = origin.x + rx;
  const cy = origin.y + ry;
  const ring: Ring = [];
  for (let index = 0; index < ELLIPSE_STEPS; index += 1) {
    const angle = (index * Math.PI * 2) / ELLIPSE_STEPS;
    ring.push([cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry]);
  }
  return ring;
}

function parametricRing(node: SceneNode, origin: { x: number; y: number }): Ring {
  const w = Math.max(0.01, node.w);
  const h = Math.max(0.01, node.h);
  const sides = Math.max(3, Math.min(12, Math.round(node.shapeSides ?? 5)));
  const cx = origin.x + w / 2;
  const cy = origin.y + h / 2;
  const ring: Ring = [];
  if (node.shapeKind === 'star') {
    const ratio = Math.max(0.1, Math.min(0.9, node.shapeInnerRatio ?? 0.38));
    for (let index = 0; index < sides * 2; index += 1) {
      const angle = -Math.PI / 2 + (index * Math.PI) / sides;
      const scale = index % 2 === 0 ? 1 : ratio;
      ring.push([cx + Math.cos(angle) * cx * scale, cy + Math.sin(angle) * cy * scale]);
    }
  } else {
    for (let index = 0; index < sides; index += 1) {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / sides;
      ring.push([cx + Math.cos(angle) * cx, cy + Math.sin(angle) * cy]);
    }
  }
  return ring;
}

export function nodeWorldRings(doc: GromaDoc, node: SceneNode): Ring[] {
  const origin = absolutePosition(doc, node.id);
  if (node.type === 'rect') return [rectRing(node, origin)];
  if (node.type === 'ellipse') return [ellipseRing(node, origin)];
  if (node.type !== 'path') return [];
  if (node.shapeKind === 'polygon' || node.shapeKind === 'star') return [parametricRing(node, origin)];
  const contours = pathContoursToWorld(node, origin);
  return contours
    .filter((contour) => contour.closed && contour.anchors.length >= 3)
    .map((contour) => flattenClosedContour(contour.anchors))
    .filter((ring) => ring.length >= 3);
}

function eligibleReason(doc: GromaDoc, ids: string[], action: VectorAction): string {
  const unique = [...new Set(ids)];
  const minimum = action === 'outline' ? 1 : 2;
  if (unique.length < minimum) {
    return action === 'outline' ? '描边转形状需要一个对象' : '布尔需要至少两个对象';
  }
  if (action === 'divide' && unique.length > MAX_DIVIDE_INPUTS) {
    return `分割最多支持 ${MAX_DIVIDE_INPUTS} 个对象`;
  }
  let parentId: string | undefined;
  for (const id of unique) {
    const node = doc.nodes[id];
    if (!node) return '对象不存在';
    if (!node.parentId) return '对象没有父级';
    if (parentId === undefined) parentId = node.parentId;
    else if (node.parentId !== parentId) return '矢量对象必须在同一父级';
    if (node.type !== 'rect' && node.type !== 'ellipse' && node.type !== 'path') {
      return '仅支持矩形、椭圆和钢笔路径';
    }
    if (node.children.length > 0) return '对象不能包含子图层';
    if (node.type === 'path' && node.shapeKind === 'arrow') return '箭头不能参与矢量运算';
    if (node.type === 'path' && !node.shapeKind) {
      const contours = pathContoursToWorld(node, absolutePosition(doc, id));
      if (!contours.some((contour) => contour.closed && contour.anchors.length >= 3)) {
        return '需要至少一条闭合路径';
      }
    }
    if (nodeWorldRings(doc, node).length === 0) return '对象需要闭合轮廓';
    if (action === 'outline') {
      const strokes = (node.strokes ?? []).filter((stroke) => stroke.width > 0);
      if (strokes.length === 0) return '对象需要实线描边';
      if (strokes.some((stroke) => stroke.dash.length > 0)) return '虚线描边暂不支持';
    }
  }
  return '';
}

function orderByZ(doc: GromaDoc, ids: string[]): string[] {
  const unique = [...new Set(ids)];
  const parentId = doc.nodes[unique[0]]?.parentId;
  const order = parentId ? doc.nodes[parentId]?.children ?? [] : [];
  return unique.sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

export function vectorActionEligibility(doc: GromaDoc, ids: string[], action: VectorAction): BooleanEligibility {
  const reason = eligibleReason(doc, ids, action);
  return { ok: reason.length === 0, reason: reason || '可执行矢量操作' };
}

export function booleanEligibility(doc: GromaDoc, ids: string[]): BooleanEligibility {
  return vectorActionEligibility(doc, ids, 'union');
}

function ringFromOutput(value: Ring): Ring {
  const ring: [number, number][] = value.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
  if (ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) ring.pop();
  return ring;
}

function outputRingToLocal(ring: Ring, minX: number, minY: number): PathContour {
  const anchors: PathContour['anchors'] = ring.map(([x, y]) => {
    const localX = Math.round((x - minX) * 100) / 100;
    const localY = Math.round((y - minY) * 100) / 100;
    return { x: localX, y: localY, inX: localX, inY: localY, outX: localX, outY: localY };
  });
  return { closed: true, anchors };
}

function countName(doc: GromaDoc, parentId: string, prefix: string): number {
  const parent = doc.nodes[parentId];
  if (!parent) return 1;
  const existing = parent.children
    .map((id) => doc.nodes[id])
    .filter((node): node is SceneNode => Boolean(node && node.name.startsWith(prefix))).length;
  return existing + 1;
}

function nodeFromWorldRings(
  doc: GromaDoc,
  rings: Ring[],
  parentId: string,
  id: string,
  name: string,
  fills: Paint[],
  strokes: Stroke[],
  opacity: number,
  fillRule: 'nonzero' | 'evenodd',
): SceneNode | null {
  const normalized = rings
    .map(ringFromOutput)
    .filter((ring) => ring.length >= 3 && Math.abs(ringArea(ring)) > 1e-6);
  if (normalized.length === 0) return null;
  const allPoints = normalized.flat();
  const minX = Math.min(...allPoints.map(([x]) => x));
  const minY = Math.min(...allPoints.map(([, y]) => y));
  const localContours = normalized.map((ring) => outputRingToLocal(ring, minX, minY));
  const geometry = penContoursGeometry(
    localContours.map((contour) => ({ closed: true, anchors: contour.anchors })),
  );
  if (!geometry) return null;
  const parentAbs = absolutePosition(doc, parentId);
  return {
    id,
    type: 'path',
    name,
    parentId,
    children: [],
    x: minX - parentAbs.x,
    y: minY - parentAbs.y,
    w: geometry.w,
    h: geometry.h,
    rotation: 0,
    opacity,
    visible: true,
    locked: false,
    clipContent: false,
    fills: fills.map((fill) => ({ ...fill })),
    strokes: strokes.map((stroke) => ({ ...stroke })),
    cornerRadius: 0,
    pathData: geometry.pathData,
    pathW: geometry.pathW,
    pathH: geometry.pathH,
    pathAnchors: geometry.contours[0]?.anchors,
    pathClosed: true,
    pathContours: geometry.contours,
    fillRule,
  };
}

function ringArea(ring: Ring): number {
  let sum = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    sum += current[0] * next[1] - next[0] * current[1];
  }
  return sum / 2;
}

function cross(a: Point, b: Point): number {
  return a.x * b.y - a.y * b.x;
}

function subtractPoint(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

function outwardNormal(a: Point, b: Point, orientation: number): Point | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return null;
  return orientation >= 0
    ? { x: dy / length, y: -dx / length }
    : { x: -dy / length, y: dx / length };
}

function circleRing(center: Point, radius: number, steps = 16): Ring {
  const ring: Ring = [];
  for (let index = 0; index < steps; index += 1) {
    const angle = (index * Math.PI * 2) / steps;
    ring.push([center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius]);
  }
  return ring;
}

function lineIntersection(originA: Point, dirA: Point, originB: Point, dirB: Point): Point | null {
  const denominator = cross(dirA, dirB);
  if (Math.abs(denominator) < 1e-9) return null;
  const delta = subtractPoint(originB, originA);
  const t = cross(delta, dirB) / denominator;
  return { x: originA.x + dirA.x * t, y: originA.y + dirA.y * t };
}

function strokeBandForRing(ring: Ring, width: number, join: StrokeJoin): MultiPolygon | null {
  if (ring.length < 3) return null;
  const half = Math.max(0.01, width / 2);
  const orientation = ringArea(ring);
  let result: MultiPolygon | null = null;
  const addPolygon = (polygon: Polygon) => {
    const shape = [polygon] as MultiPolygon;
    result = result ? polygonClipping.union(result, shape) : shape;
  };

  for (let index = 0; index < ring.length; index += 1) {
    const start = { x: ring[index][0], y: ring[index][1] };
    const endPoint = ring[(index + 1) % ring.length];
    const end = { x: endPoint[0], y: endPoint[1] };
    const normal = outwardNormal(start, end, orientation);
    if (!normal) continue;
    const quad: Ring = [
      [start.x + normal.x * half, start.y + normal.y * half],
      [end.x + normal.x * half, end.y + normal.y * half],
      [end.x - normal.x * half, end.y - normal.y * half],
      [start.x - normal.x * half, start.y - normal.y * half],
    ];
    addPolygon([quad]);
  }

  for (let index = 0; index < ring.length; index += 1) {
    const previous = { x: ring[(index - 1 + ring.length) % ring.length][0], y: ring[(index - 1 + ring.length) % ring.length][1] };
    const vertexPoint = ring[index];
    const nextPoint = ring[(index + 1) % ring.length];
    const vertex = { x: vertexPoint[0], y: vertexPoint[1] };
    const next = { x: nextPoint[0], y: nextPoint[1] };
    const dirPrev = subtractPoint(vertex, previous);
    const dirNext = subtractPoint(next, vertex);
    const turn = cross(dirPrev, dirNext);
    const convex = orientation >= 0 ? turn > 0 : turn < 0;
    if (!convex) continue;
    const normalPrev = outwardNormal(previous, vertex, orientation);
    const normalNext = outwardNormal(vertex, next, orientation);
    if (!normalPrev || !normalNext) continue;
    const pPrev = { x: vertex.x + normalPrev.x * half, y: vertex.y + normalPrev.y * half };
    const pNext = { x: vertex.x + normalNext.x * half, y: vertex.y + normalNext.y * half };
    if (join === 'round') {
      addPolygon([circleRing(vertex, half)]);
      continue;
    }
    if (join === 'miter') {
      const miter = lineIntersection(pPrev, dirPrev, pNext, dirNext);
      if (miter && Math.hypot(miter.x - vertex.x, miter.y - vertex.y) <= half * 4) {
        addPolygon([[
          [vertex.x, vertex.y],
          [pPrev.x, pPrev.y],
          [miter.x, miter.y],
          [pNext.x, pNext.y],
        ]]);
        continue;
      }
    }
    addPolygon([[
      [vertex.x, vertex.y],
      [pPrev.x, pPrev.y],
      [pNext.x, pNext.y],
    ]]);
  }

  return result;
}

function strokeBandForNode(doc: GromaDoc, node: SceneNode, stroke: Stroke): MultiPolygon | null {
  let result: MultiPolygon | null = null;
  for (const ring of nodeWorldRings(doc, node)) {
    const band = strokeBandForRing(ring, stroke.width, stroke.join);
    if (!band || band.length === 0) continue;
    result = result ? polygonClipping.union(result, band) : band;
  }
  return result;
}

function bandsToRings(bands: MultiPolygon): Ring[] {
  return bands.flat().map(ringFromOutput).filter((ring) => ring.length >= 3);
}

export function vectorActionBuild(
  doc: GromaDoc,
  ids: string[],
  action: VectorAction,
  nextId: () => string,
): VectorBuild | { error: string } {
  const readiness = vectorActionEligibility(doc, ids, action);
  if (!readiness.ok) return { error: readiness.reason };
  const sourceIds = orderByZ(doc, ids);
  const sourceNodes = sourceIds.map((sourceId) => doc.nodes[sourceId]).filter((node): node is SceneNode => Boolean(node));
  const first = sourceNodes[0];
  if (!first?.parentId) return { error: '对象没有父级' };
  const parentId = first.parentId;
  const prefix = ACTION_PREFIX[action];
  let nameIndex = countName(doc, parentId, prefix);
  const nextName = () => `${prefix} ${nameIndex++}`;

  if (action === 'outline') {
    const nodes: SceneNode[] = [];
    const sourcePatches: Record<string, SceneNode> = {};
    for (const source of sourceNodes) {
      for (const stroke of source.strokes ?? []) {
        if (stroke.width <= 0) continue;
        const band = strokeBandForNode(doc, source, stroke);
        if (!band || band.length === 0) return { error: '描边轮廓为空' };
        const node = nodeFromWorldRings(
          doc,
          bandsToRings(band),
          parentId,
          nextId(),
          nextName(),
          [{ type: 'solid', color: stroke.color, opacity: stroke.opacity }],
          [],
          source.opacity,
          'evenodd',
        );
        if (!node) return { error: '描边轮廓为空' };
        nodes.push(node);
      }
      sourcePatches[source.id] = { ...source, strokes: [] };
    }
    if (nodes.length === 0) return { error: '对象需要实线描边' };
    return {
      nodes,
      sourceIds,
      removeSourceIds: sourceNodes.filter((node) => node.fills.length === 0).map((node) => node.id),
      sourcePatches,
      parentId,
      replaceSources: false,
    };
  }

  const geoms = sourceNodes.map((node) => {
    const rings = nodeWorldRings(doc, node);
    const polygons: Polygon[] = rings.map((ring) => [ring]);
    return polygons as MultiPolygon;
  });

  if (action === 'flatten') {
    const rings = sourceNodes.flatMap((node) => nodeWorldRings(doc, node));
    const node = nodeFromWorldRings(
      doc,
      rings,
      parentId,
      nextId(),
      nextName(),
      first.fills,
      first.strokes ?? [],
      first.opacity,
      'nonzero',
    );
    if (!node) return { error: '拍平结果为空' };
    return {
      nodes: [node],
      sourceIds,
      removeSourceIds: sourceIds,
      sourcePatches: {},
      parentId,
      replaceSources: true,
    };
  }

  if (action === 'divide') {
    const nodes: SceneNode[] = [];
    const count = sourceNodes.length;
    for (let mask = 1; mask < 1 << count; mask += 1) {
      const included: MultiPolygon[] = [];
      const excluded: MultiPolygon[] = [];
      for (let index = 0; index < count; index += 1) {
        if (mask & (1 << index)) included.push(geoms[index]);
        else excluded.push(geoms[index]);
      }
      let region: MultiPolygon;
      try {
        region = included.length === 1
          ? included[0]
          : polygonClipping.intersection(included[0], ...included.slice(1));
        if (excluded.length > 0) {
          region = polygonClipping.difference(
            region,
            excluded.length === 1 ? excluded[0] : polygonClipping.union(excluded[0], ...excluded.slice(1)),
          );
        }
      } catch {
        return { error: '分割计算失败' };
      }
      if (region.length === 0) continue;
      const topIndex = 31 - Math.clz32(mask);
      const appearance = sourceNodes[topIndex];
      const node = nodeFromWorldRings(
        doc,
        bandsToRings(region),
        parentId,
        nextId(),
        nextName(),
        appearance.fills,
        appearance.strokes ?? [],
        appearance.opacity,
        'evenodd',
      );
      if (node) nodes.push(node);
    }
    if (nodes.length === 0) return { error: '分割结果为空' };
    return {
      nodes,
      sourceIds,
      removeSourceIds: sourceIds,
      sourcePatches: {},
      parentId,
      replaceSources: true,
    };
  }

  let result: MultiPolygon;
  try {
    switch (action) {
      case 'union':
        result = polygonClipping.union(geoms[0], ...geoms.slice(1));
        break;
      case 'subtract':
        result = polygonClipping.difference(geoms[0], ...geoms.slice(1));
        break;
      case 'intersect':
        result = polygonClipping.intersection(geoms[0], ...geoms.slice(1));
        break;
      case 'exclude':
        result = polygonClipping.xor(geoms[0], ...geoms.slice(1));
        break;
      default:
        return { error: '不支持的矢量运算' };
    }
  } catch {
    return { error: '矢量计算失败' };
  }
  if (result.length === 0) return { error: '布尔结果为空' };
  const node = nodeFromWorldRings(
    doc,
    bandsToRings(result),
    parentId,
    nextId(),
    nextName(),
    first.fills,
    first.strokes ?? [],
    first.opacity,
    'evenodd',
  );
  if (!node) return { error: '布尔结果为空' };
  return {
    nodes: [node],
    sourceIds,
    removeSourceIds: sourceIds,
    sourcePatches: {},
    parentId,
    replaceSources: true,
  };
}

export function booleanPathNode(
  doc: GromaDoc,
  ids: string[],
  op: BooleanOp,
  id: string,
): BooleanPathBuild | { error: string } {
  const build = vectorActionBuild(doc, ids, op, () => id);
  if ('error' in build) return build;
  return { node: build.nodes[0], sourceIds: build.sourceIds, parentId: build.parentId };
}
