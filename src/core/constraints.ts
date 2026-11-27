import type { Constraints, GromaDoc, SceneNode } from './types';

export const DEFAULT_CONSTRAINTS: Constraints = { horizontal: 'left', vertical: 'top' };

export interface RectPatch {
  x: number;
  y: number;
  w: number;
  h: number;
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function horizontalOf(node: SceneNode): Constraints['horizontal'] {
  return node.constraints?.horizontal ?? DEFAULT_CONSTRAINTS.horizontal;
}

function verticalOf(node: SceneNode): Constraints['vertical'] {
  return node.constraints?.vertical ?? DEFAULT_CONSTRAINTS.vertical;
}

/** 父画板从 oldParent 缩放到 newParent 时，子节点的相对矩形。 */
export function constrainedRect(oldParent: SceneNode, newParent: SceneNode, child: SceneNode): RectPatch {
  const dw = newParent.w - oldParent.w;
  const dh = newParent.h - oldParent.h;
  let x = child.x;
  let y = child.y;
  let w = child.w;
  let h = child.h;

  switch (horizontalOf(child)) {
    case 'right':
      x += dw;
      break;
    case 'center':
      x += dw / 2;
      break;
    case 'leftRight':
      w = Math.max(0, child.w + dw);
      break;
    case 'scale': {
      const ratio = oldParent.w > 0 ? newParent.w / oldParent.w : 1;
      x *= ratio;
      w = Math.max(0, child.w * ratio);
      break;
    }
    case 'left':
    default:
      break;
  }

  switch (verticalOf(child)) {
    case 'bottom':
      y += dh;
      break;
    case 'center':
      y += dh / 2;
      break;
    case 'topBottom':
      h = Math.max(0, child.h + dh);
      break;
    case 'scale': {
      const ratio = oldParent.h > 0 ? newParent.h / oldParent.h : 1;
      y *= ratio;
      h = Math.max(0, child.h * ratio);
      break;
    }
    case 'top':
    default:
      break;
  }

  return { x: round(x), y: round(y), w: round(w), h: round(h) };
}

/**
 * 把父画板缩放后的子图层重排一并写进文档。
 * 只有 frame / section 的子图层受约束；子 frame 自身尺寸变化时，继续向下应用。
 */
export function applyConstraintsOnResize(
  doc: GromaDoc,
  parentId: string,
  before: SceneNode,
  after: SceneNode,
): GromaDoc {
  if (before.w === after.w && before.h === after.h) return doc;
  const nodes = { ...doc.nodes, [parentId]: after };

  const walk = (oldParent: SceneNode, newParent: SceneNode, depth: number) => {
    if (depth > 128 || oldParent.type !== 'frame' && oldParent.type !== 'section') return;
    for (const childId of oldParent.children) {
      const child = nodes[childId];
      if (!child || child.type === 'page') continue;
      const patch = constrainedRect(oldParent, newParent, child);
      if (patch.x === child.x && patch.y === child.y && patch.w === child.w && patch.h === child.h) continue;
      const next: SceneNode = { ...child, ...patch, x: finite(patch.x), y: finite(patch.y), w: finite(patch.w, 0), h: finite(patch.h, 0) };
      nodes[childId] = next;
      if (next.type === 'frame' || next.type === 'section') walk(child, next, depth + 1);
    }
  };

  walk(before, after, 0);
  return { ...doc, nodes };
}
