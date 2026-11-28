import { absoluteRect } from './geometry';
import type { GromaDoc, Page, Rect, SceneNode } from './types';

export interface PrototypeHotspot {
  node: SceneNode;
  targetId: string;
  rect: Rect;
}

export function framesInPage(doc: GromaDoc, page: Page): SceneNode[] {
  const result: SceneNode[] = [];
  const root = doc.nodes[page.rootId];
  if (!root) return result;
  const stack = [...root.children];
  while (stack.length) {
    const node = doc.nodes[stack.pop() as string];
    if (!node) continue;
    if (node.type === 'frame') result.push(node);
    stack.push(...node.children);
  }
  return result;
}

/** 演示起点：页面根下的画板，以及 Section 内的直接画板。 */
export function topLevelFrames(doc: GromaDoc, page: Page): SceneNode[] {
  const root = doc.nodes[page.rootId];
  if (!root) return [];
  const result: SceneNode[] = [];
  for (const id of root.children) {
    const node = doc.nodes[id];
    if (!node) continue;
    if (node.type === 'frame') result.push(node);
    if (node.type === 'section') {
      for (const childId of node.children) {
        const child = doc.nodes[childId];
        if (child?.type === 'frame') result.push(child);
      }
    }
  }
  return result;
}

export function nearestFrame(doc: GromaDoc, nodeId: string | null): SceneNode | null {
  let current = nodeId ? doc.nodes[nodeId] : null;
  while (current) {
    if (current.type === 'frame') return current;
    if (!current.parentId) return null;
    current = doc.nodes[current.parentId] ?? null;
  }
  return null;
}

export function prototypeStart(doc: GromaDoc, page: Page, selectedId: string | null): SceneNode | null {
  const selected = nearestFrame(doc, selectedId);
  if (selected && framesInPage(doc, page).some((frame) => frame.id === selected.id)) return selected;
  return topLevelFrames(doc, page)[0] ?? null;
}

/** 画板内所有带点击跳转的节点，坐标换算到画板本地。 */
export function prototypeHotspots(doc: GromaDoc, frameId: string): PrototypeHotspot[] {
  const frame = doc.nodes[frameId];
  if (!frame || frame.type !== 'frame') return [];
  const frameRect = absoluteRect(doc, frameId);
  const result: PrototypeHotspot[] = [];
  const stack = [...frame.children];
  while (stack.length) {
    const node = doc.nodes[stack.pop() as string];
    if (!node) continue;
    if (node.prototype?.targetId) {
      const abs = absoluteRect(doc, node.id);
      result.push({
        node,
        targetId: node.prototype.targetId,
        rect: { x: abs.x - frameRect.x, y: abs.y - frameRect.y, w: abs.w, h: abs.h },
      });
    }
    stack.push(...node.children);
  }
  return result;
}
