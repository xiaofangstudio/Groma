import type { GromaDoc, Page, Rect, SceneNode } from './types';

export function absolutePosition(doc: GromaDoc, nodeId: string): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let current: SceneNode | undefined = doc.nodes[nodeId];
  let guard = 0;
  while (current && guard < 64) {
    x += current.x;
    y += current.y;
    current = current.parentId ? doc.nodes[current.parentId] : undefined;
    guard += 1;
  }
  return { x, y };
}

export function absoluteRect(doc: GromaDoc, nodeId: string): Rect {
  const node = doc.nodes[nodeId];
  if (!node) return { x: 0, y: 0, w: 0, h: 0 };
  if (node.type === 'group' && node.children.length > 0) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const childId of node.children) {
      if (!doc.nodes[childId]) continue;
      const r = absoluteRect(doc, childId);
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.w);
      maxY = Math.max(maxY, r.y + r.h);
    }
    if (Number.isFinite(minX)) return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  const pos = absolutePosition(doc, nodeId);
  return { x: pos.x, y: pos.y, w: node.w, h: node.h };
}

export function parentAbsolute(doc: GromaDoc, nodeId: string): { x: number; y: number } {
  const node = doc.nodes[nodeId];
  if (!node?.parentId) return { x: 0, y: 0 };
  return absolutePosition(doc, node.parentId);
}

function walkHit(
  doc: GromaDoc,
  node: SceneNode,
  ox: number,
  oy: number,
  px: number,
  py: number,
): SceneNode | null {
  if (!node.visible || node.locked) return null;
  const ax = ox + node.x;
  const ay = oy + node.y;
  if (node.type === 'group') {
    for (let i = node.children.length - 1; i >= 0; i -= 1) {
      const child = doc.nodes[node.children[i]];
      if (!child) continue;
      const hit = walkHit(doc, child, ax, ay, px, py);
      if (hit) return hit;
    }
    if (px < ax || py < ay || px > ax + node.w || py > ay + node.h) return null;
    return node;
  }
  if (px < ax || py < ay || px > ax + node.w || py > ay + node.h) return null;

  for (let i = node.children.length - 1; i >= 0; i -= 1) {
    const child = doc.nodes[node.children[i]];
    if (!child) continue;
    const hit = walkHit(doc, child, ax, ay, px, py);
    if (hit) return hit;
  }
  return node.type === 'page' ? null : node;
}

export function hitTestDeep(doc: GromaDoc, page: Page, px: number, py: number): SceneNode | null {
  const root = doc.nodes[page.rootId];
  if (!root) return null;
  for (let i = root.children.length - 1; i >= 0; i -= 1) {
    const child = doc.nodes[root.children[i]];
    if (!child) continue;
    const hit = walkHit(doc, child, 0, 0, px, py);
    if (hit) return hit;
  }
  return null;
}

/** 单击选中分组时选最外层分组；双击用 hitTestDeep 进入组内。 */
export function hitTest(doc: GromaDoc, page: Page, px: number, py: number): SceneNode | null {
  const deep = hitTestDeep(doc, page, px, py);
  if (!deep) return null;
  let outermostGroup: SceneNode | null = null;
  let cursor: SceneNode | undefined = deep;
  let guard = 0;
  while (cursor && cursor.parentId && guard < 64) {
    const parent: SceneNode | undefined = doc.nodes[cursor.parentId];
    if (!parent || parent.type === 'page') break;
    if (parent.type === 'group') outermostGroup = parent;
    cursor = parent;
    guard += 1;
  }
  return outermostGroup ?? deep;
}

function walkFrames(
  doc: GromaDoc,
  node: SceneNode,
  ox: number,
  oy: number,
  px: number,
  py: number,
): SceneNode | null {
  if (!node.visible || node.locked) return null;
  const ax = ox + node.x;
  const ay = oy + node.y;
  if (px < ax || py < ay || px > ax + node.w || py > ay + node.h) return null;
  for (let i = node.children.length - 1; i >= 0; i -= 1) {
    const child = doc.nodes[node.children[i]];
    if (!child || child.type !== 'frame' || !child.visible || child.locked) continue;
    const deeper = walkFrames(doc, child, ax, ay, px, py);
    if (deeper) return deeper;
    const cx = ax + child.x;
    const cy = ay + child.y;
    if (px >= cx && py >= cy && px <= cx + child.w && py <= cy + child.h) return child;
  }
  return null;
}

/** 取最深的一个可用画板，作为新图形的父节点；没有则返回 null（挂到页面根） */
export function deepestFrame(doc: GromaDoc, page: Page, px: number, py: number): SceneNode | null {
  const root = doc.nodes[page.rootId];
  if (!root) return null;
  for (let i = root.children.length - 1; i >= 0; i -= 1) {
    const child = doc.nodes[root.children[i]];
    if (!child || child.type !== 'frame' || !child.visible || child.locked) continue;
    const deeper = walkFrames(doc, child, 0, 0, px, py);
    if (deeper) return deeper;
    if (px >= child.x && py >= child.y && px <= child.x + child.w && py <= child.y + child.h) return child;
  }
  return null;
}

export function isPointInsideFrame(doc: GromaDoc, frame: SceneNode, px: number, py: number): boolean {
  const p = absolutePosition(doc, frame.id);
  return px >= p.x && py >= p.y && px <= p.x + frame.w && py <= p.y + frame.h;
}

/** 选区外接框；空选返回 null */
export function selectionBounds(doc: GromaDoc, ids: string[]): Rect | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const id of ids) {
    const node = doc.nodes[id];
    if (!node || node.type === 'page') continue;
    const r = absoluteRect(doc, id);
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * 只保留选区里的顶层节点：父节点和子节点同时被选中时，子节点不重复参与移动/对齐/分组。
 * 顺序按传入顺序保留。
 */
export function topLevelSelection(doc: GromaDoc, ids: string[]): string[] {
  const selected = new Set(ids);
  const out: string[] = [];
  for (const id of ids) {
    const node = doc.nodes[id];
    if (!node || node.type === 'page') continue;
    let cursor = node.parentId;
    let covered = false;
    let guard = 0;
    while (cursor && guard < 64) {
      if (selected.has(cursor)) {
        covered = true;
        break;
      }
      cursor = doc.nodes[cursor]?.parentId ?? null;
      guard += 1;
    }
    if (!covered) out.push(id);
  }
  return out;
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function fullyInside(a: Rect, b: Rect): boolean {
  return a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
}

/**
 * 框选命中规则：
 * - 完整框住一个容器时，选容器本身，不把里面的子节点全选走。
 * - 只压到容器一部分时，继续向下找真正被压到的子节点。
 * - 锁定/隐藏节点不参与。
 */
export function marqueeSelection(doc: GromaDoc, page: Page, rect: Rect): string[] {
  const root = doc.nodes[page.rootId];
  if (!root || rect.w <= 0 || rect.h <= 0) return [];
  const out: string[] = [];

  const walk = (node: SceneNode, ox: number, oy: number): void => {
    if (!node.visible || node.locked || node.type === 'page') return;
    const ax = ox + node.x;
    const ay = oy + node.y;
    const abs: Rect =
      node.type === 'group'
        ? absoluteRect(doc, node.id)
        : { x: ax, y: ay, w: node.w, h: node.h };
    if (!intersects(abs, rect)) return;
    if (fullyInside(abs, rect)) {
      out.push(node.id);
      return;
    }
    let childHits = 0;
    for (const childId of node.children) {
      const child = doc.nodes[childId];
      if (!child) continue;
      const before = out.length;
      walk(child, ax, ay);
      if (out.length > before) childHits += 1;
    }
    if (childHits === 0) out.push(node.id);
  };

  for (const childId of root.children) {
    const child = doc.nodes[childId];
    if (child) walk(child, 0, 0);
  }
  return out;
}

