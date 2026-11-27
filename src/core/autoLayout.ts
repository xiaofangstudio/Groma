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

function size(value: number): number {
  return Math.max(0, round(value));
}

/**
 * 对一棵子树做自动布局。先排子层，当前容器再用子层新尺寸排版；
 * 因此嵌套自动布局会先确定内层尺寸，再被外层使用。
 */
export function layoutSubtree(nodes: Record<string, SceneNode>, rootId: string): void {
  const walk = (id: string) => {
    const node = nodes[id];
    if (!node) return;
    for (const childId of node.children) walk(childId);
    if (!node.layout || !supportsAutoLayout(node)) return;
    layoutChildren(nodes, node);
  };
  walk(rootId);
}

function layoutChildren(nodes: Record<string, SceneNode>, parent: SceneNode): void {
  const layout = parent.layout;
  if (!layout) return;
  const children = parent.children
    .map((id) => nodes[id])
    .filter((child): child is SceneNode => Boolean(child && child.visible));
  if (children.length === 0) return;

  const horizontal = layout.mode === 'horizontal';
  const gap = Math.max(0, round(layout.gap));
  const totalMain = children.reduce((sum, child) => sum + (horizontal ? child.w : child.h), 0);
  const fixedGaps = gap * Math.max(0, children.length - 1);
  const content = totalMain + fixedGaps;

  let width = parent.w;
  let height = parent.h;
  if (layout.hug) {
    if (horizontal) width = Math.max(1, round(content + layout.padding.left + layout.padding.right));
    else height = Math.max(1, round(content + layout.padding.top + layout.padding.bottom));
  }

  const innerW = Math.max(0, width - layout.padding.left - layout.padding.right);
  const innerH = Math.max(0, height - layout.padding.top - layout.padding.bottom);
  const free = Math.max(0, (horizontal ? innerW : innerH) - content);

  let gapStep = gap;
  let offset = 0;
  if (layout.justify === 'center') offset = free / 2;
  else if (layout.justify === 'end') offset = free;
  else if (layout.justify === 'space-between' && children.length > 1) gapStep = gap + free / (children.length - 1);

  let cursor = (horizontal ? layout.padding.left : layout.padding.top) + offset;
  for (const child of children) {
    const next: SceneNode = { ...child };
    if (horizontal) {
      next.x = round(cursor);
      if (layout.align === 'stretch') {
        next.h = Math.max(1, round(innerH));
        next.y = layout.padding.top;
      } else {
        const crossFree = innerH - child.h;
        const crossOffset =
          layout.align === 'center' ? crossFree / 2 : layout.align === 'end' ? crossFree : 0;
        next.y = round(layout.padding.top + crossOffset);
      }
      cursor += child.w + gapStep;
    } else {
      next.y = round(cursor);
      if (layout.align === 'stretch') {
        next.w = Math.max(1, round(innerW));
        next.x = layout.padding.left;
      } else {
        const crossFree = innerW - child.w;
        const crossOffset =
          layout.align === 'center' ? crossFree / 2 : layout.align === 'end' ? crossFree : 0;
        next.x = round(layout.padding.left + crossOffset);
      }
      cursor += child.h + gapStep;
    }
    if (
      next.x !== child.x ||
      next.y !== child.y ||
      (horizontal && next.h !== child.h) ||
      (!horizontal && next.w !== child.w)
    ) {
      nodes[child.id] = next;
    }
  }

  if (width !== parent.w || height !== parent.h) {
    nodes[parent.id] = { ...parent, w: size(width), h: size(height) };
  }
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
