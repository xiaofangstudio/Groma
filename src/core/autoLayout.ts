import type { AutoLayout, GromaDoc, SceneNode } from './types';

export const AUTO_LAYOUT_TYPES = new Set<SceneNode['type']>(['frame', 'section', 'group']);

export function supportsAutoLayout(node: SceneNode | undefined): boolean {
  return Boolean(node && AUTO_LAYOUT_TYPES.has(node.type));
}

export function defaultAutoLayout(): AutoLayout {
  return {
    mode: 'horizontal',
    gap: 12,
    padding: { top: 16, right: 16, bottom: 16, left: 16 },
    align: 'start',
    justify: 'start',
    hug: false,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * 对一棵子树做自动布局。先排子层，当前容器再用子层新尺寸排版；
 * 因此嵌套自动布局会先确定内层尺寸，再被外层使用。外层把内层 Fill 拉伸后
 * 再跑一轮，保证嵌套容器内部也跟着回流。
 */
export function layoutSubtree(nodes: Record<string, SceneNode>, rootId: string): void {
  for (let pass = 0; pass < 4; pass += 1) {
    let changed = false;
    const walk = (id: string) => {
      const node = nodes[id];
      if (!node) return;
      for (const childId of node.children) walk(childId);
      if (!node.layout || !supportsAutoLayout(node)) return;
      changed = layoutChildren(nodes, node) || changed;
    };
    walk(rootId);
    if (!changed) break;
  }
}

function layoutChildren(nodes: Record<string, SceneNode>, parent: SceneNode): boolean {
  const layout = parent.layout;
  if (!layout) return false;
  const children = parent.children
    .map((id) => nodes[id])
    .filter((child): child is SceneNode => Boolean(child && child.visible));
  if (children.length === 0) return false;

  const horizontal = layout.mode === 'horizontal';
  const gap = Math.max(0, round(layout.gap));
  const gaps = gap * Math.max(0, children.length - 1);
  const hugWidth = layout.hugWidth ?? (horizontal ? layout.hug : false);
  const hugHeight = layout.hugHeight ?? (!horizontal ? layout.hug : false);
  const hugMain = horizontal ? hugWidth : hugHeight;
  const hugCross = horizontal ? hugHeight : hugWidth;
  let changed = false;

  const mainSizeOf = (child: SceneNode) => {
    const base = horizontal ? child.layoutBaseW : child.layoutBaseH;
    if (hugMain && child.layoutGrow && base) return base;
    return horizontal ? child.w : child.h;
  };
  const crossSizeOf = (child: SceneNode) => {
    const base = horizontal ? child.layoutBaseH : child.layoutBaseW;
    const stretched = (child.layoutAlignSelf ?? layout.align) === 'stretch';
    if (hugCross && stretched && base) return base;
    return horizontal ? child.h : child.w;
  };

  const naturalMain = children.reduce((sum, child) => sum + mainSizeOf(child), 0) + gaps;
  const naturalCross = Math.max(...children.map(crossSizeOf));
  const naturalWidth =
    (horizontal ? naturalMain : naturalCross) + layout.padding.left + layout.padding.right;
  const naturalHeight =
    (horizontal ? naturalCross : naturalMain) + layout.padding.top + layout.padding.bottom;
  const width = hugWidth ? Math.max(1, round(naturalWidth)) : parent.w;
  const height = hugHeight ? Math.max(1, round(naturalHeight)) : parent.h;
  const innerW = Math.max(0, width - layout.padding.left - layout.padding.right);
  const innerH = Math.max(0, height - layout.padding.top - layout.padding.bottom);
  const innerMain = horizontal ? innerW : innerH;
  const innerCross = horizontal ? innerH : innerW;

  const fillers = children.filter((child) => child.layoutGrow && !hugMain);
  const fixed = children.filter((child) => !child.layoutGrow || hugMain);
  const fixedMain = fixed.reduce((sum, child) => sum + mainSizeOf(child), 0);
  const fillMain = fillers.length > 0 ? Math.max(1, (innerMain - gaps - fixedMain) / fillers.length) : 0;
  const content = fixedMain + fillMain * fillers.length + gaps;
  const free = Math.max(0, innerMain - content);

  let gapStep = gap;
  let offset = 0;
  if (layout.justify === 'center') offset = free / 2;
  else if (layout.justify === 'end') offset = free;
  else if (layout.justify === 'space-between' && children.length > 1) gapStep = gap + free / (children.length - 1);

  let cursor = (horizontal ? layout.padding.left : layout.padding.top) + offset;
  for (const child of children) {
    const isFillMain = fillers.includes(child);
    const mainSize = isFillMain ? fillMain : mainSizeOf(child);
    const alignSelf = child.layoutAlignSelf ?? layout.align;
    const crossSize = alignSelf === 'stretch' && !hugCross ? innerCross : crossSizeOf(child);
    const crossFree = innerCross - crossSize;
    const crossOffset = alignSelf === 'center' ? crossFree / 2 : alignSelf === 'end' ? crossFree : 0;
    const next: SceneNode = horizontal
      ? {
          ...child,
          w: Math.max(1, round(mainSize)),
          h: Math.max(1, round(crossSize)),
          x: round(cursor),
          y: round(layout.padding.top + crossOffset),
        }
      : {
          ...child,
          w: Math.max(1, round(crossSize)),
          h: Math.max(1, round(mainSize)),
          x: round(layout.padding.left + crossOffset),
          y: round(cursor),
        };
    if (next.x !== child.x || next.y !== child.y || next.w !== child.w || next.h !== child.h) {
      nodes[child.id] = next;
      changed = true;
    }
    cursor += mainSize + gapStep;
  }

  if (width !== parent.w || height !== parent.h) {
    nodes[parent.id] = { ...(nodes[parent.id] ?? parent), w: Math.max(1, round(width)), h: Math.max(1, round(height)) };
    changed = true;
  }
  return changed;
}

/** 找到节点所在页面的根节点；页面节点返回自身。 */
export function pageRootOf(doc: GromaDoc, id: string): string | null {
  let current = doc.nodes[id];
  while (current && current.type !== 'page') {
    if (!current.parentId) return null;
    current = doc.nodes[current.parentId];
  }
  return current?.id ?? null;
}

/** 从节点向上找到页面根，整页重排。布局只影响同一页，不做跨页传播。 */
export function reflowPageFrom(doc: GromaDoc, id: string): GromaDoc {
  const rootId = pageRootOf(doc, id);
  if (!rootId) return doc;
  const nodes = { ...doc.nodes };
  layoutSubtree(nodes, rootId);
  return { ...doc, nodes };
}

/** 只有容器自身或直接父容器带自动布局时才需要重排。 */
export function needsAutoLayoutReflow(doc: GromaDoc, id: string): boolean {
  const node = doc.nodes[id];
  if (!node) return false;
  if (node.layout) return true;
  const parent = node.parentId ? doc.nodes[node.parentId] : undefined;
  return Boolean(parent?.layout);
}

/** 子层是否被父级自动布局接管；用于画布拖动与微调时阻止手动改坐标。 */
export function isAutoLayoutChild(doc: GromaDoc, id: string): boolean {
  const node = doc.nodes[id];
  const parent = node?.parentId ? doc.nodes[node.parentId] : undefined;
  return Boolean(parent?.layout);
}
