import { collectSubtree } from './commands';
import type { GromaDoc, Page, SceneNode } from './types';

const PAGE_BG = '#E9E8E4';

function pageRoot(doc: GromaDoc, pageId: string): SceneNode | null {
  const page = doc.pages.find((item) => item.id === pageId);
  if (!page) return null;
  return doc.nodes[page.rootId] ?? null;
}

export function nextPageName(doc: GromaDoc): string {
  const names = new Set(doc.pages.map((page) => page.name));
  let index = 1;
  while (names.has(`页面 ${index}`)) index += 1;
  return `页面 ${index}`;
}

function uniquePageName(doc: GromaDoc, base: string): string {
  const names = new Set(doc.pages.map((page) => page.name));
  if (!names.has(base)) return base;
  let index = 2;
  while (names.has(`${base} ${index}`)) index += 1;
  return `${base} ${index}`;
}

export interface PageResult {
  doc: GromaDoc;
  page: Page;
}

export function addPage(doc: GromaDoc, makeId: () => string, name = nextPageName(doc)): PageResult {
  const pageId = makeId();
  const rootId = makeId();
  if (doc.nodes[rootId]) throw new Error(`页面根节点 id 已存在：${rootId}`);
  if (doc.pages.some((page) => page.id === pageId)) throw new Error(`页面 id 已存在：${pageId}`);
  const root: SceneNode = {
    id: rootId,
    type: 'page',
    name,
    parentId: null,
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
  };
  const page: Page = { id: pageId, name, rootId, background: PAGE_BG };
  return {
    doc: {
      ...doc,
      nodes: { ...doc.nodes, [rootId]: root },
      pages: [...doc.pages, page],
    },
    page,
  };
}

export function renamePage(doc: GromaDoc, pageId: string, rawName: string): GromaDoc | null {
  const name = rawName.trim().slice(0, 80);
  const page = doc.pages.find((item) => item.id === pageId);
  if (!page || !name || page.name === name) return null;
  const root = doc.nodes[page.rootId];
  return {
    ...doc,
    pages: doc.pages.map((item) => (item.id === pageId ? { ...item, name } : item)),
    nodes: root ? { ...doc.nodes, [root.id]: { ...root, name } } : doc.nodes,
  };
}

export function duplicatePage(doc: GromaDoc, pageId: string, makeId: (type: SceneNode['type']) => string): PageResult | null {
  const source = doc.pages.find((page) => page.id === pageId);
  const sourceRoot = source ? doc.nodes[source.rootId] : null;
  if (!source || !sourceRoot) return null;

  const originals = collectSubtree(doc, sourceRoot.id);
  const idMap = new Map<string, string>();
  for (const node of Object.values(originals)) idMap.set(node.id, makeId(node.type));

  const pageIdNew = makeId('page');
  const rootIdNew = idMap.get(sourceRoot.id) as string;
  const name = uniquePageName(doc, `${source.name} 副本`);
  const nodes = { ...doc.nodes };
  const cloned: Record<string, SceneNode> = {};
  for (const node of Object.values(originals)) {
    const cloneId = idMap.get(node.id) as string;
    cloned[cloneId] = {
      ...node,
      id: cloneId,
      name: node.id === sourceRoot.id ? name : node.name,
      parentId: node.parentId ? (idMap.get(node.parentId) ?? null) : null,
      children: node.children.map((childId) => idMap.get(childId)).filter((childId): childId is string => Boolean(childId)),
      x: node.id === sourceRoot.id ? 0 : node.x,
      y: node.id === sourceRoot.id ? 0 : node.y,
    };
  }
  Object.assign(nodes, cloned);

  const page: Page = {
    ...source,
    id: pageIdNew,
    name,
    rootId: rootIdNew,
    guides: source.guides ? source.guides.map((guide) => ({ ...guide })) : undefined,
  };
  const sourceIndex = doc.pages.findIndex((item) => item.id === pageId);
  const pages = [...doc.pages];
  pages.splice(sourceIndex + 1, 0, page);
  return { doc: { ...doc, nodes, pages }, page };
}

export interface RemovePageResult {
  doc: GromaDoc;
  page: Page;
  nextPageId: string;
}

export function removePage(doc: GromaDoc, pageId: string): RemovePageResult | null {
  if (doc.pages.length <= 1) return null;
  const index = doc.pages.findIndex((item) => item.id === pageId);
  if (index < 0) return null;
  const page = doc.pages[index];
  const root = doc.nodes[page.rootId];
  if (!root) return null;
  const subtree = collectSubtree(doc, root.id);
  const nodes = { ...doc.nodes };
  for (const id of Object.keys(subtree)) delete nodes[id];
  const pages = doc.pages.filter((item) => item.id !== pageId);
  const next = pages[index] ?? pages[Math.max(0, index - 1)];
  return {
    doc: { ...doc, nodes, pages },
    page,
    nextPageId: next.id,
  };
}

export function pageContainsNode(doc: GromaDoc, pageId: string, nodeId: string): boolean {
  const root = pageRoot(doc, pageId);
  if (!root) return false;
  let cursor = doc.nodes[nodeId]?.parentId ?? null;
  while (cursor) {
    if (cursor === root.id) return true;
    cursor = doc.nodes[cursor]?.parentId ?? null;
  }
  return false;
}

/** 把页面移动到 `toIndex` 这个最终位置；只改 pages[] 顺序，不动页面内节点。 */
export function movePage(doc: GromaDoc, pageId: string, toIndex: number): GromaDoc | null {
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= doc.pages.length) return null;
  const from = doc.pages.findIndex((page) => page.id === pageId);
  if (from < 0 || from === toIndex) return null;
  const pages = doc.pages.slice();
  const [page] = pages.splice(from, 1);
  pages.splice(toIndex, 0, page);
  return { ...doc, pages };
}
