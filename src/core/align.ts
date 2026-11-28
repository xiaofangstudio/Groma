import type { GromaDoc } from './types';
import { absoluteRect, selectionBounds, topLevelSelection } from './geometry';

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';
export type DistributeMode = 'horizontal' | 'vertical';

export interface MoveDelta {
  id: string;
  dx: number;
  dy: number;
}

function deltasFor(doc: GromaDoc, ids: string[], resolve: (id: string) => { dx: number; dy: number } | null): MoveDelta[] {
  const top = topLevelSelection(doc, ids);
  const out: MoveDelta[] = [];
  for (const id of top) {
    const d = resolve(id);
    if (d && (d.dx !== 0 || d.dy !== 0)) out.push({ id, ...d });
  }
  return out;
}

/** 相对选区外接框对齐；返回每个顶层节点的位移 */
export function alignDeltas(doc: GromaDoc, ids: string[], mode: AlignMode): MoveDelta[] {
  const bounds = selectionBounds(doc, ids);
  if (!bounds) return [];
  return deltasFor(doc, ids, (id) => {
    const r = absoluteRect(doc, id);
    if (mode === 'left') return { dx: bounds.x - r.x, dy: 0 };
    if (mode === 'hcenter') return { dx: bounds.x + bounds.w / 2 - (r.x + r.w / 2), dy: 0 };
    if (mode === 'right') return { dx: bounds.x + bounds.w - (r.x + r.w), dy: 0 };
    if (mode === 'top') return { dx: 0, dy: bounds.y - r.y };
    if (mode === 'vcenter') return { dx: 0, dy: bounds.y + bounds.h / 2 - (r.y + r.h / 2) };
    return { dx: 0, dy: bounds.y + bounds.h - (r.y + r.h) };
  });
}

/** 单选时相对直接父容器（画板/分组/区块）对齐；父级是页面时返回空 */
export function alignToParentDeltas(doc: GromaDoc, id: string, mode: AlignMode): MoveDelta[] {
  const node = doc.nodes[id];
  const parent = node?.parentId ? doc.nodes[node.parentId] : null;
  if (!node || !parent || parent.type === 'page') return [];
  const area = absoluteRect(doc, parent.id);
  const r = absoluteRect(doc, id);
  if (mode === 'left') return [{ id, dx: area.x - r.x, dy: 0 }];
  if (mode === 'hcenter') return [{ id, dx: area.x + (area.w - r.w) / 2 - r.x, dy: 0 }];
  if (mode === 'right') return [{ id, dx: area.x + area.w - (r.x + r.w), dy: 0 }];
  if (mode === 'top') return [{ id, dx: 0, dy: area.y - r.y }];
  if (mode === 'vcenter') return [{ id, dx: 0, dy: area.y + (area.h - r.h) / 2 - r.y }];
  return [{ id, dx: 0, dy: area.y + area.h - (r.y + r.h) }];
}

/**
 * 等间距分布：首尾贴住选区外接框，中间按“边界到边界”等 gap 排开。
 * 至少 3 个节点才有意义，少于 3 个返回空。
 */
export function distributeDeltas(doc: GromaDoc, ids: string[], mode: DistributeMode): MoveDelta[] {
  const top = topLevelSelection(doc, ids);
  if (top.length < 3) return [];
  const rects = top.map((id) => ({ id, ...absoluteRect(doc, id) }));
  const totalSize = rects.reduce((sum, r) => sum + (mode === 'horizontal' ? r.w : r.h), 0);

  if (mode === 'horizontal') {
    const ordered = [...rects].sort((a, b) => a.x - b.x);
    const min = Math.min(...ordered.map((r) => r.x));
    const max = Math.max(...ordered.map((r) => r.x + r.w));
    const gap = (max - min - totalSize) / (ordered.length - 1);
    let cursor = min;
    const out: MoveDelta[] = [];
    for (const r of ordered) {
      if (r.x !== cursor) out.push({ id: r.id, dx: cursor - r.x, dy: 0 });
      cursor += r.w + gap;
    }
    return out;
  }

  const ordered = [...rects].sort((a, b) => a.y - b.y);
  const min = Math.min(...ordered.map((r) => r.y));
  const max = Math.max(...ordered.map((r) => r.y + r.h));
  const gap = (max - min - totalSize) / (ordered.length - 1);
  let cursor = min;
  const out: MoveDelta[] = [];
  for (const r of ordered) {
    if (r.y !== cursor) out.push({ id: r.id, dx: 0, dy: cursor - r.y });
    cursor += r.h + gap;
  }
  return out;
}
