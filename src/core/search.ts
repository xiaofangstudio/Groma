import type { GromaDoc, SceneNode } from './types';

export interface NodeSearchHit {
  pageId: string;
  pageName: string;
  nodeId: string;
  nodeName: string;
  nodeType: SceneNode['type'];
  /** 从顶层到父节点的名字，不含页面根节点；顶层节点为“顶层”。 */
  path: string;
}

function parentPath(doc: GromaDoc, node: SceneNode, rootId: string): string {
  const names: string[] = [];
  let cursor = node.parentId;
  let guard = 0;
  while (cursor && cursor !== rootId && guard < 64) {
    const parent = doc.nodes[cursor];
    if (!parent || parent.type === 'page') break;
    names.unshift(parent.name);
    cursor = parent.parentId;
    guard += 1;
  }
  return names.length > 0 ? names.join(' / ') : '顶层';
}

/** 跨页面按图层名搜索；按页面顺序做深度优先遍历，不包含页面根节点。 */
export function searchPageNodes(doc: GromaDoc, rawQuery: string, limit = 30): NodeSearchHit[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return [];
  const max = Math.max(1, Math.min(100, Math.floor(limit)));
  const hits: NodeSearchHit[] = [];

  const visit = (nodeId: string, pageId: string, pageName: string, rootId: string) => {
    if (hits.length >= max) return;
    const node = doc.nodes[nodeId];
    if (!node || node.type === 'page') return;
    if (node.name.toLowerCase().includes(query)) {
      hits.push({
        pageId,
        pageName,
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        path: parentPath(doc, node, rootId),
      });
      if (hits.length >= max) return;
    }
    for (const childId of node.children) visit(childId, pageId, pageName, rootId);
  };

  for (const page of doc.pages) {
    const root = doc.nodes[page.rootId];
    if (!root) continue;
    for (const childId of root.children) {
      visit(childId, page.id, page.name, root.id);
      if (hits.length >= max) return hits;
    }
  }
  return hits;
}
