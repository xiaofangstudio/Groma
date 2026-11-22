import type { GromaDoc, NodeType, SceneNode } from './types';
import { absolutePosition, topLevelSelection } from './geometry';

/** 只允许改表现属性，结构字段（id/parentId/children/type）不能从这里穿透 */
export type NodePatch = Partial<Omit<SceneNode, 'id' | 'parentId' | 'children' | 'type'>>;

export type SceneCommand =
  | { type: 'insert'; parentId: string; node: SceneNode; index?: number }
  | { type: 'remove'; id: string }
  | { type: 'patch'; id: string; patch: NodePatch }
  | { type: 'restore'; parentId: string; index: number; subtree: Record<string, SceneNode> }
  | {
      type: 'clone';
      id: string;
      makeId: (type: NodeType) => string;
      dx?: number;
      dy?: number;
      nameSuffix?: string;
    }
  | { type: 'group'; ids: string[]; makeId: (type: NodeType) => string; name?: string }
  | { type: 'ungroup'; id: string };

export interface CommandResult {
  doc: GromaDoc;
  /** 新建/克隆出来的根节点 */
  node?: SceneNode;
  /** patch 前值 */
  before?: SceneNode;
  /** patch 后值 */
  after?: SceneNode;
  parentId?: string;
  index?: number;
  subtree?: Record<string, SceneNode>;
  /** 分组/解组用：只记录受影响的节点，避免为一次结构变更保存整份文档 */
  beforeNodes?: Record<string, SceneNode>;
  afterNodes?: Record<string, SceneNode>;
  undoRemove?: string[];
  redoRemove?: string[];
  childIds?: string[];
}

function requireNode(doc: GromaDoc, id: string): SceneNode {
  const node = doc.nodes[id];
  if (!node) throw new Error(`节点不存在：${id}`);
  return node;
}

export function collectSubtree(doc: GromaDoc, rootId: string): Record<string, SceneNode> {
  const out: Record<string, SceneNode> = {};
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop();
    if (!id) continue;
    const node = doc.nodes[id];
    if (!node) continue;
    out[id] = node;
    for (const child of node.children) stack.push(child);
  }
  return out;
}

function insertionIndex(parent: SceneNode, index: number | undefined): number {
  if (index === undefined) return parent.children.length;
  return Math.max(0, Math.min(index, parent.children.length));
}

function insertNode(doc: GromaDoc, parentId: string, node: SceneNode, index?: number): CommandResult {
  const parent = requireNode(doc, parentId);
  if (doc.nodes[node.id]) throw new Error(`节点 id 已存在：${node.id}`);
  if (node.parentId !== parentId) throw new Error('节点的 parentId 与插入位置不一致');
  const at = insertionIndex(parent, index);
  const children = [...parent.children];
  children.splice(at, 0, node.id);
  return {
    doc: {
      ...doc,
      nodes: { ...doc.nodes, [parentId]: { ...parent, children }, [node.id]: node },
    },
    node,
    parentId,
    index: at,
  };
}

function removeNode(doc: GromaDoc, id: string): CommandResult {
  const node = requireNode(doc, id);
  if (!node.parentId || node.type === 'page') throw new Error('不能删除页面根节点');
  const parent = requireNode(doc, node.parentId);
  const index = parent.children.indexOf(id);
  if (index < 0) throw new Error('父节点与子节点索引不一致');
  const subtree = collectSubtree(doc, id);
  const nodes = { ...doc.nodes };
  for (const key of Object.keys(subtree)) delete nodes[key];
  nodes[parent.id] = { ...parent, children: parent.children.filter((childId) => childId !== id) };
  return {
    doc: { ...doc, nodes },
    parentId: parent.id,
    index,
    subtree,
  };
}

function sanitizePatch(patch: NodePatch): NodePatch {
  const safe = { ...patch } as Partial<SceneNode>;
  delete safe.id;
  delete safe.parentId;
  delete safe.children;
  delete safe.type;
  return safe;
}

function patchNode(doc: GromaDoc, id: string, patch: NodePatch): CommandResult {
  const before = requireNode(doc, id);
  const after: SceneNode = { ...before, ...sanitizePatch(patch) };
  return {
    doc: { ...doc, nodes: { ...doc.nodes, [id]: after } },
    before,
    after,
  };
}

function restoreNode(
  doc: GromaDoc,
  parentId: string,
  index: number,
  subtree: Record<string, SceneNode>,
): CommandResult {
  const parent = requireNode(doc, parentId);
  const root = Object.values(subtree).find((node) => node.parentId === parentId);
  if (!root) throw new Error('要恢复的子树没有根节点');
  const nodes = { ...doc.nodes, ...subtree };
  const children = [...parent.children];
  children.splice(insertionIndex(parent, index), 0, root.id);
  nodes[parentId] = { ...parent, children };
  return { doc: { ...doc, nodes }, node: root, parentId, index, subtree };
}

function cloneNode(
  doc: GromaDoc,
  id: string,
  makeId: (type: NodeType) => string,
  dx = 0,
  dy = 0,
  nameSuffix = '',
): CommandResult {
  const source = requireNode(doc, id);
  if (!source.parentId || source.type === 'page') throw new Error('不能复制页面根节点');
  const parent = requireNode(doc, source.parentId);
  const originals = collectSubtree(doc, id);
  const idMap = new Map<string, string>();
  for (const oldId of Object.keys(originals)) idMap.set(oldId, makeId(originals[oldId].type));

  const clones: Record<string, SceneNode> = {};
  for (const [oldId, oldNode] of Object.entries(originals)) {
    const cloneId = idMap.get(oldId) as string;
    const isRoot = oldId === id;
    clones[cloneId] = {
      ...oldNode,
      id: cloneId,
      name: isRoot && nameSuffix ? `${oldNode.name}${nameSuffix}`.slice(0, 40) : oldNode.name,
      parentId: isRoot ? parent.id : (idMap.get(oldNode.parentId ?? '') ?? oldNode.parentId),
      children: oldNode.children.map((childId) => idMap.get(childId)).filter((x): x is string => Boolean(x)),
      ...(isRoot ? { x: oldNode.x + dx, y: oldNode.y + dy } : {}),
    };
  }

  const root = clones[idMap.get(id) as string];
  const at = parent.children.length;
  const children = [...parent.children, root.id];
  return {
    doc: {
      ...doc,
      nodes: { ...doc.nodes, ...clones, [parent.id]: { ...parent, children } },
    },
    node: root,
    parentId: parent.id,
    index: at,
    subtree: clones,
  };
}

function groupNodes(
  doc: GromaDoc,
  ids: string[],
  makeId: (type: NodeType) => string,
  name?: string,
): CommandResult {
  const top = topLevelSelection(doc, ids);
  if (top.length < 2) throw new Error('至少选择两个顶层节点才能分组');
  const nodes = top.map((id) => requireNode(doc, id));
  if (nodes.some((node) => node.type === 'page' || node.parentId === null)) throw new Error('页面根节点不能分组');
  if (nodes.some((node) => node.locked)) throw new Error('锁定节点不能分组');
  const parentId = nodes[0].parentId as string;
  if (nodes.some((node) => node.parentId !== parentId)) throw new Error('暂只支持把同一父级下的节点分组');
  const parent = requireNode(doc, parentId);
  if (nodes.some((node) => !parent.children.includes(node.id))) throw new Error('父节点与子节点索引不一致');

  // 分组内部保持图层原有上下顺序，不按点击顺序重排。
  const orderedTop = parent.children.filter((id) => top.includes(id));
  const orderedNodes = orderedTop.map((id) => requireNode(doc, id));
  const beforeNodes: Record<string, SceneNode> = { [parent.id]: parent };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of orderedNodes) {
    beforeNodes[node.id] = node;
    const abs = absolutePosition(doc, node.id);
    minX = Math.min(minX, abs.x);
    minY = Math.min(minY, abs.y);
    maxX = Math.max(maxX, abs.x + node.w);
    maxY = Math.max(maxY, abs.y + node.h);
  }

  const parentAbs = parent.type === 'page' ? { x: 0, y: 0 } : absolutePosition(doc, parent.id);
  const groupId = makeId('group');
  if (doc.nodes[groupId]) throw new Error(`节点 id 已存在：${groupId}`);
  const group: SceneNode = {
    id: groupId,
    type: 'group',
    name: name ?? `分组 ${parent.children.filter((id) => doc.nodes[id]?.type === 'group').length + 1}`,
    parentId,
    children: orderedTop,
    x: Math.round(minX - parentAbs.x),
    y: Math.round(minY - parentAbs.y),
    w: Math.max(1, Math.round(maxX - minX)),
    h: Math.max(1, Math.round(maxY - minY)),
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    clipContent: false,
    fills: [],
    cornerRadius: 0,
  };

  const selected = new Set(orderedTop);
  const topIndex = Math.max(...parent.children.map((id, index) => (selected.has(id) ? index : -1)));
  const children = parent.children.filter((id) => !selected.has(id));
  const insertAt = parent.children.filter((id, index) => !selected.has(id) && index < topIndex).length;
  children.splice(insertAt, 0, groupId);

  const moved: Record<string, SceneNode> = {};
  for (const node of orderedNodes) {
    const abs = absolutePosition(doc, node.id);
    moved[node.id] = {
      ...node,
      parentId: groupId,
      x: Math.round(abs.x - (parentAbs.x + group.x)),
      y: Math.round(abs.y - (parentAbs.y + group.y)),
    };
  }

  return {
    doc: {
      ...doc,
      nodes: {
        ...doc.nodes,
        ...moved,
        [parent.id]: { ...parent, children },
        [groupId]: group,
      },
    },
    node: group,
    parentId,
    index: insertAt,
    subtree: { [groupId]: group, ...moved },
    beforeNodes,
    afterNodes: { [parent.id]: { ...parent, children }, [groupId]: group, ...moved },
    undoRemove: [groupId],
  };
}

function ungroupNode(doc: GromaDoc, id: string): CommandResult {
  const group = requireNode(doc, id);
  if (group.type !== 'group') throw new Error('只能解散分组节点');
  if (!group.parentId) throw new Error('分组没有父节点');
  const parent = requireNode(doc, group.parentId);
  const groupIndex = parent.children.indexOf(group.id);
  if (groupIndex < 0) throw new Error('父节点与分组索引不一致');
  const groupAbs = absolutePosition(doc, group.id);
  const parentAbs = parent.type === 'page' ? { x: 0, y: 0 } : absolutePosition(doc, parent.id);

  const beforeNodes: Record<string, SceneNode> = { [group.id]: group, [parent.id]: parent };
  const afterNodes: Record<string, SceneNode> = {};
  const children = [...parent.children];
  children.splice(groupIndex, 1, ...group.children);
  afterNodes[parent.id] = { ...parent, children };

  for (const childId of group.children) {
    const child = requireNode(doc, childId);
    beforeNodes[child.id] = child;
    afterNodes[child.id] = {
      ...child,
      parentId: parent.id,
      x: Math.round(groupAbs.x + child.x - parentAbs.x),
      y: Math.round(groupAbs.y + child.y - parentAbs.y),
    };
  }

  const nodes = { ...doc.nodes, ...afterNodes };
  delete nodes[group.id];
  return {
    doc: { ...doc, nodes },
    parentId: parent.id,
    index: groupIndex,
    childIds: group.children,
    beforeNodes,
    afterNodes,
    redoRemove: [group.id],
  };
}

export function applyCommand(doc: GromaDoc, command: SceneCommand): CommandResult {
  switch (command.type) {
    case 'insert':
      return insertNode(doc, command.parentId, command.node, command.index);
    case 'remove':
      return removeNode(doc, command.id);
    case 'patch':
      return patchNode(doc, command.id, command.patch);
    case 'restore':
      return restoreNode(doc, command.parentId, command.index, command.subtree);
    case 'clone':
      return cloneNode(doc, command.id, command.makeId, command.dx, command.dy, command.nameSuffix);
    case 'group':
      return groupNodes(doc, command.ids, command.makeId, command.name);
    case 'ungroup':
      return ungroupNode(doc, command.id);
    default: {
      const exhaustive: never = command;
      throw new Error(`未知命令：${JSON.stringify(exhaustive)}`);
    }
  }
}
