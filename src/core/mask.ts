import type { Ring } from 'polygon-clipping';
import type { GromaDoc, SceneNode } from './types';
import { nodeWorldRings } from './boolean';

export interface MaskState {
  ok: boolean;
  reason: string;
  parentId?: string;
  maskId?: string;
  aboveIds?: string[];
}

const MASK_PARENT_TYPES = new Set<SceneNode['type']>(['frame', 'section', 'group']);

export function maskTypeOf(node: SceneNode): 'geometry' | 'alpha' | 'luminance' {
  return node.maskType ?? 'geometry';
}

/** 同一父级只认最上面一个可见蒙版；隐藏的蒙版不裁切。 */
export function maskIndexForParent(doc: GromaDoc, parent: SceneNode): number {
  for (let index = parent.children.length - 1; index >= 0; index -= 1) {
    const child = doc.nodes[parent.children[index]];
    if (child?.isMask && child.visible) return index;
  }
  return -1;
}

export function maskForParent(doc: GromaDoc, parent: SceneNode): SceneNode | undefined {
  const index = maskIndexForParent(doc, parent);
  return index >= 0 ? doc.nodes[parent.children[index]] : undefined;
}

export function maskEligibility(doc: GromaDoc, id: string): MaskState {
  const node = doc.nodes[id];
  if (!node) return { ok: false, reason: '对象不存在' };
  const parent = node.parentId ? doc.nodes[node.parentId] : undefined;
  if (!parent || !MASK_PARENT_TYPES.has(parent.type)) {
    return { ok: false, reason: '蒙版必须放在画板、区块或编组内' };
  }
  const index = parent.children.indexOf(id);
  if (index < 0) return { ok: false, reason: '蒙版不在父级图层列表中' };
  const aboveIds = parent.children.slice(index + 1).filter((childId) => Boolean(doc.nodes[childId]));
  const otherMask = parent.children.some((childId) => childId !== id && doc.nodes[childId]?.isMask);
  if (otherMask) return { ok: false, reason: '同一容器只能有一个蒙版' };
  if (node.isMask) {
    return { ok: true, reason: '', parentId: parent.id, maskId: id, aboveIds };
  }
  if (node.type === 'text' || node.type === 'image' || node.type === 'slice' || node.type === 'page') {
    return { ok: false, reason: '只有闭合形状或钢笔路径可以作为蒙版' };
  }
  if (node.children.length > 0) return { ok: false, reason: '蒙版不能包含子图层' };
  if (nodeWorldRings(doc, node).length === 0) return { ok: false, reason: '蒙版需要闭合轮廓' };
  if (aboveIds.length === 0) return { ok: false, reason: '蒙版上方需要可裁切的图层' };
  return { ok: true, reason: '', parentId: parent.id, maskId: id, aboveIds };
}

function pointInRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [xi, yi] = ring[index];
    const [xj, yj] = ring[previous];
    if ((yi > y) !== (yj > y)) {
      const crossX = ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi;
      if (x < crossX) inside = !inside;
    }
  }
  return inside;
}

/** 与 canvas / SVG 一致，多个轮廓按 evenodd 处理，支持内孔。 */
export function pointInMask(doc: GromaDoc, mask: SceneNode, x: number, y: number): boolean {
  const rings = nodeWorldRings(doc, mask);
  if (rings.length === 0) return false;
  let inside = false;
  for (const ring of rings) {
    if (ring.length >= 3 && pointInRing(x, y, ring)) inside = !inside;
  }
  return inside;
}
