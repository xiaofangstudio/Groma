import polygonClipping, { type MultiPolygon, type Polygon, type Ring } from 'polygon-clipping';
import { absolutePosition } from './geometry';
import { penContoursGeometry, pathContoursToWorld, type PenAnchor } from './pen';
import type { GromaDoc, PathContour, SceneNode } from './types';

export type BooleanOp = 'union' | 'subtract' | 'intersect' | 'exclude';

export interface BooleanPathBuild {
  node: SceneNode;
  sourceIds: string[];
  parentId: string;
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

function nodeRings(doc: GromaDoc, node: SceneNode): Ring[] {
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

function eligibleReason(doc: GromaDoc, ids: string[]): string {
  const unique = [...new Set(ids)];
  if (unique.length !== 2) return '布尔需要正好两个对象';
  let parentId: string | undefined;
  for (const id of unique) {
    const node = doc.nodes[id];
    if (!node) return '对象不存在';
    if (!node.parentId) return '对象没有父级';
    if (parentId === undefined) parentId = node.parentId;
    else if (node.parentId !== parentId) return '布尔对象必须在同一父级';
    if (node.type !== 'rect' && node.type !== 'ellipse' && node.type !== 'path') {
      return '仅支持矩形、椭圆和钢笔路径';
    }
    if (node.children.length > 0) return '布尔对象不能包含子图层';
    if (node.type === 'path' && node.shapeKind === 'arrow') return '箭头不能参与布尔';
    if (node.type === 'path' && !node.shapeKind) {
      const contours = pathContoursToWorld(node, absolutePosition(doc, id));
      if (!contours.some((contour) => contour.closed && contour.anchors.length >= 3)) {
        return '需要至少一条闭合路径';
      }
    }
    if (nodeRings(doc, node).length === 0) return '对象需要闭合轮廓';
  }
  return '';
}

function orderByZ(doc: GromaDoc, ids: string[]): string[] {
  const unique = [...new Set(ids)];
  const parentId = doc.nodes[unique[0]]?.parentId;
  const order = parentId ? doc.nodes[parentId]?.children ?? [] : [];
  return unique.sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

export function booleanEligibility(doc: GromaDoc, ids: string[]): BooleanEligibility {
  const reason = eligibleReason(doc, ids);
  return { ok: reason.length === 0, reason: reason || '可执行布尔' };
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

export function booleanPathNode(
  doc: GromaDoc,
  ids: string[],
  op: BooleanOp,
  id: string,
): BooleanPathBuild | { error: string } {
  const readiness = booleanEligibility(doc, ids);
  if (!readiness.ok) return { error: readiness.reason };
  const sourceIds = orderByZ(doc, ids);
  const sourceNodes = sourceIds.map((sourceId) => doc.nodes[sourceId]).filter((node): node is SceneNode => Boolean(node));
  const first = sourceNodes[0];
  if (!first?.parentId) return { error: '对象没有父级' };
  const geoms = sourceNodes.map((node) => {
    const rings = nodeRings(doc, node);
    const polygons: Polygon[] = rings.map((ring) => [ring]);
    return polygons as MultiPolygon;
  });
  let result: MultiPolygon;
  try {
    switch (op) {
      case 'union':
        result = polygonClipping.union(geoms[0], geoms[1]);
        break;
      case 'subtract':
        result = polygonClipping.difference(geoms[0], geoms[1]);
        break;
      case 'intersect':
        result = polygonClipping.intersection(geoms[0], geoms[1]);
        break;
      case 'exclude':
        result = polygonClipping.xor(geoms[0], geoms[1]);
        break;
      default:
        return { error: '不支持的布尔运算' };
    }
  } catch {
    return { error: '布尔计算失败' };
  }
  if (result.length === 0) return { error: '布尔结果为空' };
  const rings = result.flat().map(ringFromOutput).filter((ring) => ring.length >= 3);
  if (rings.length === 0) return { error: '布尔结果为空' };
  const allPoints = rings.flat();
  const minX = Math.min(...allPoints.map(([x]) => x));
  const minY = Math.min(...allPoints.map(([, y]) => y));
  const localContours = rings.map((ring) => outputRingToLocal(ring, minX, minY));
  const geometry = penContoursGeometry(
    localContours.map((contour) => ({ closed: true, anchors: contour.anchors })),
  );
  if (!geometry) return { error: '布尔结果为空' };
  const parentId = first.parentId;
  const parentAbs = absolutePosition(doc, parentId);
  const prefix = BOOLEAN_PREFIX[op];
  const node: SceneNode = {
    id,
    type: 'path',
    name: `${prefix} ${countName(doc, parentId, prefix)}`,
    parentId,
    children: [],
    x: minX - parentAbs.x,
    y: minY - parentAbs.y,
    w: geometry.w,
    h: geometry.h,
    rotation: 0,
    opacity: first.opacity,
    visible: true,
    locked: false,
    clipContent: false,
    fills: first.fills.map((fill) => ({ ...fill })),
    strokes: (first.strokes ?? []).map((stroke) => ({ ...stroke })),
    cornerRadius: 0,
    pathData: geometry.pathData,
    pathW: geometry.pathW,
    pathH: geometry.pathH,
    pathAnchors: geometry.contours[0]?.anchors,
    pathClosed: true,
    pathContours: geometry.contours,
    fillRule: 'evenodd',
  };
  return { node, sourceIds, parentId };
}
