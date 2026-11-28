import { absoluteRect } from './geometry';
import type { GromaDoc, Guide, Page, Rect } from './types';

/** x 表示一条竖线（对齐某个横坐标），y 表示一条横线。 */
export type SnapAxis = 'x' | 'y';

export interface SnapMark {
  x: number;
  y: number;
  kind: 'edge' | 'center';
}

export interface SnapGuide {
  axis: SnapAxis;
  position: number;
  start: number;
  end: number;
  /** 吸附到页级手动参考线时标记，UI 可加高亮。 */
  manual?: boolean;
  /** 目标图层的极值/中心交点，UI 画成小圆标记。 */
  marks?: SnapMark[];
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: SnapGuide[];
}

export type HorizontalSnapEdge = 'left' | 'right' | null;
export type VerticalSnapEdge = 'top' | 'bottom' | null;

export interface ResizeSnapResult {
  rect: Rect;
  guides: SnapGuide[];
}

interface Candidate {
  anchor: number;
  value: number;
  target: Rect | null;
  distance: number;
  manual?: boolean;
}

function xAnchors(rect: Rect): number[] {
  return [rect.x, rect.x + rect.w / 2, rect.x + rect.w];
}

function yAnchors(rect: Rect): number[] {
  return [rect.y, rect.y + rect.h / 2, rect.y + rect.h];
}

function targetAnchors(rect: Rect, axis: SnapAxis): number[] {
  return axis === 'x' ? xAnchors(rect) : yAnchors(rect);
}

/**
 * 在所有目标边/中心里找一个离当前锚点最近的位置。
 * 只有落在阈值内才返回；同距离保留先找到的目标，结果稳定。
 */
function nearestAnchor(
  anchors: number[],
  targets: Rect[],
  axis: SnapAxis,
  threshold: number,
  accept?: (value: number) => boolean,
): Candidate | null {
  if (threshold <= 0 || anchors.length === 0) return null;
  let best: Candidate | null = null;
  for (const target of targets) {
    for (const value of targetAnchors(target, axis)) {
      if (accept && !accept(value)) continue;
      for (const anchor of anchors) {
        const distance = Math.abs(value - anchor);
        if (distance > threshold) continue;
        if (!best || distance < best.distance) {
          best = { anchor, value, target, distance };
        }
      }
    }
  }
  return best;
}

/** 手动参考线只有一根线，不参与边/中心三档目标框的构造。 */
function nearestGuide(
  anchors: number[],
  guides: Guide[],
  axis: SnapAxis,
  threshold: number,
  accept?: (value: number) => boolean,
): Candidate | null {
  if (threshold <= 0 || anchors.length === 0) return null;
  let best: Candidate | null = null;
  for (const guide of guides) {
    if (guide.axis !== axis) continue;
    if (accept && !accept(guide.position)) continue;
    for (const anchor of anchors) {
      const distance = Math.abs(guide.position - anchor);
      if (distance > threshold) continue;
      if (!best || distance < best.distance) {
        best = { anchor, value: guide.position, target: null, distance, manual: true };
      }
    }
  }
  return best;
}

/** 同距离时优先节点目标，保持原有吸附的手感。 */
function closer(a: Candidate | null, b: Candidate | null): Candidate | null {
  if (!a) return b;
  if (!b) return a;
  return b.distance < a.distance ? b : a;
}

function nearestEdgeHit(
  anchors: number[],
  targets: Rect[],
  guides: Guide[],
  axis: SnapAxis,
  threshold: number,
  accept?: (value: number) => boolean,
): Candidate | null {
  return closer(
    nearestAnchor(anchors, targets, axis, threshold, accept),
    nearestGuide(anchors, guides, axis, threshold, accept),
  );
}

function guideFor(axis: SnapAxis, candidate: Candidate, moved: Rect): SnapGuide {
  const target = candidate.target;
  const marks: SnapMark[] | undefined = target
    ? axis === 'x'
      ? [
          { x: candidate.value, y: target.y, kind: 'edge' },
          { x: candidate.value, y: target.y + target.h / 2, kind: 'center' },
          { x: candidate.value, y: target.y + target.h, kind: 'edge' },
        ]
      : [
          { x: target.x, y: candidate.value, kind: 'edge' },
          { x: target.x + target.w / 2, y: candidate.value, kind: 'center' },
          { x: target.x + target.w, y: candidate.value, kind: 'edge' },
        ]
    : undefined;
  if (axis === 'x') {
    const start = candidate.target ? Math.min(moved.y, candidate.target.y) : moved.y;
    const end = candidate.target
      ? Math.max(moved.y + moved.h, candidate.target.y + candidate.target.h)
      : moved.y + moved.h;
    return {
      axis,
      position: candidate.value,
      start,
      end,
      ...(candidate.manual ? { manual: true } : {}),
      ...(marks ? { marks } : {}),
    };
  }
  const start = candidate.target ? Math.min(moved.x, candidate.target.x) : moved.x;
  const end = candidate.target
    ? Math.max(moved.x + moved.w, candidate.target.x + candidate.target.w)
    : moved.x + moved.w;
  return {
    axis,
    position: candidate.value,
    start,
    end,
    ...(candidate.manual ? { manual: true } : {}),
    ...(marks ? { marks } : {}),
  };
}

/**
 * 拖动选区时的边/中心吸附。位移按整条选区计算，不逐节点各吸各的。
 * threshold 是世界坐标，调用方用 8 / viewport.scale 换算。
 */
export function snapSelectionBounds(
  bounds: Rect,
  targets: Rect[],
  threshold: number,
  disabled = false,
  guides: Guide[] = [],
): SnapResult {
  if (disabled || (targets.length === 0 && guides.length === 0)) return { dx: 0, dy: 0, guides: [] };

  const x = closer(
    nearestAnchor(xAnchors(bounds), targets, 'x', threshold),
    nearestGuide(xAnchors(bounds), guides, 'x', threshold),
  );
  const y = closer(
    nearestAnchor(yAnchors(bounds), targets, 'y', threshold),
    nearestGuide(yAnchors(bounds), guides, 'y', threshold),
  );
  const dx = x ? x.value - x.anchor : 0;
  const dy = y ? y.value - y.anchor : 0;
  if (!x && !y) return { dx: 0, dy: 0, guides: [] };

  const moved = { ...bounds, x: bounds.x + dx, y: bounds.y + dy };
  const out: SnapGuide[] = [];
  if (x) out.push(guideFor('x', x, moved));
  if (y) out.push(guideFor('y', y, moved));
  return { dx, dy, guides: out };
}

/**
 * 角点缩放只吸附正在被拖的那条边，固定边不动。
 * 禁止把边拖到固定边另一侧，避免出现负宽高。
 */
export function snapResizeRect(
  rect: Rect,
  horizontal: HorizontalSnapEdge,
  vertical: VerticalSnapEdge,
  targets: Rect[],
  threshold: number,
  disabled = false,
  guides: Guide[] = [],
): ResizeSnapResult {
  const out = { ...rect };
  const guideLines: SnapGuide[] = [];
  if (disabled || (targets.length === 0 && guides.length === 0)) return { rect: out, guides: guideLines };

  if (horizontal === 'left') {
    const right = rect.x + rect.w;
    const hit = nearestEdgeHit(
      [rect.x],
      targets,
      guides,
      'x',
      threshold,
      (value) => value < right - 1,
    );
    if (hit) {
      out.x = hit.value;
      out.w = Math.max(1, right - out.x);
      guideLines.push(guideFor('x', hit, out));
    }
  } else if (horizontal === 'right') {
    const left = rect.x;
    const hit = nearestEdgeHit(
      [rect.x + rect.w],
      targets,
      guides,
      'x',
      threshold,
      (value) => value > left + 1,
    );
    if (hit) {
      out.w = Math.max(1, hit.value - left);
      guideLines.push(guideFor('x', hit, out));
    }
  }

  if (vertical === 'top') {
    const bottom = rect.y + rect.h;
    const hit = nearestEdgeHit(
      [rect.y],
      targets,
      guides,
      'y',
      threshold,
      (value) => value < bottom - 1,
    );
    if (hit) {
      out.y = hit.value;
      out.h = Math.max(1, bottom - out.y);
      guideLines.push(guideFor('y', hit, out));
    }
  } else if (vertical === 'bottom') {
    const top = rect.y;
    const hit = nearestEdgeHit(
      [rect.y + rect.h],
      targets,
      guides,
      'y',
      threshold,
      (value) => value > top + 1,
    );
    if (hit) {
      out.h = Math.max(1, hit.value - top);
      guideLines.push(guideFor('y', hit, out));
    }
  }

  return { rect: out, guides: guideLines };
}

/**
 * 吸附目标：当前页所有可见、未锁定节点，排除选区自身及其子树。
 * 选中子节点时父画板仍是目标；选中画板时不会吸到自己内部子节点。
 */
export function collectSnapTargets(doc: GromaDoc, page: Page, selectedIds: string[]): Rect[] {
  const excluded = new Set<string>();
  const excludeSubtree = (id: string): void => {
    const node = doc.nodes[id];
    if (!node || excluded.has(id)) return;
    excluded.add(id);
    for (const childId of node.children) excludeSubtree(childId);
  };
  for (const id of selectedIds) excludeSubtree(id);

  const root = doc.nodes[page.rootId];
  if (!root) return [];
  const out: Rect[] = [];
  const walk = (id: string): void => {
    const node = doc.nodes[id];
    if (!node || !node.visible || node.locked || node.type === 'page') return;
    if (excluded.has(node.id)) return;
    const rect = absoluteRect(doc, node.id);
    if (rect.w > 0 || rect.h > 0) out.push(rect);
    for (const childId of node.children) walk(childId);
  };
  for (const childId of root.children) walk(childId);
  return out;
}
