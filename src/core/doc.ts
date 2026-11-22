import type { GromaDoc, SceneNode } from './types';

let seq = 0;
function nid(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

function baseNode(partial: Partial<SceneNode> & Pick<SceneNode, 'id' | 'type' | 'name' | 'parentId'>): SceneNode {
  return {
    children: [],
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    clipContent: false,
    fills: [],
    cornerRadius: 0,
    ...partial,
  };
}

function clampSize(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(16384, Math.round(value as number)));
}

/**
 * 新建工程：一页、一个画板。
 * 默认 1440×900；欢迎页可选桌面/手机/平板/方图/自定义尺寸。
 */
export function createDoc(
  name = '未命名设计',
  width = 1440,
  height = 900,
  frameName?: string,
): GromaDoc {
  const pageId = nid('page');
  const rootId = nid('root');
  const frameId = nid('frame');
  const w = clampSize(width, 1440);
  const h = clampSize(height, 900);
  const label = frameName ?? (w === 1440 && h === 900 ? '桌面 1440' : `画板 ${w}`);

  const root = baseNode({
    id: rootId,
    type: 'page',
    name: '页面 1',
    parentId: null,
  });
  root.children = [frameId];

  const frame = baseNode({
    id: frameId,
    type: 'frame',
    name: label,
    parentId: rootId,
    w,
    h,
    clipContent: true,
    fills: [{ type: 'solid', color: '#FFFFFF', opacity: 1 }],
  });

  return {
    version: 1,
    name,
    pages: [{ id: pageId, name: '页面 1', rootId, background: '#E9E8E4' }],
    nodes: { [rootId]: root, [frameId]: frame },
  };
}

export function childrenOf(doc: GromaDoc, parentId: string): SceneNode[] {
  const parent = doc.nodes[parentId];
  if (!parent) return [];
  return parent.children.map((id) => doc.nodes[id]).filter(Boolean);
}
