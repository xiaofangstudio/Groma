import type { GromaDoc, LibrarySource, NodeType, SceneNode } from './types';
import { absolutePosition, topLevelSelection } from './geometry';
import { applyConstraintsOnResize } from './constraints';
import { needsAutoLayoutReflow, reflowPageFrom } from './autoLayout';
import { applyInstanceOverrides, remapOverridesForSwap } from './instance';
import { booleanGroupBuild, refreshBooleanChain, refreshBooleanNode, type BooleanOp } from './boolean';

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
  | { type: 'boolean'; ids: string[]; op: BooleanOp; makeId: (type: NodeType) => string; name?: string }
  | { type: 'ungroup'; id: string }
  | { type: 'reorder'; id: string; toIndex: number }
  | { type: 'reparent'; id: string; parentId: string; toIndex: number }
  | { type: 'create-instance'; id: string; makeId: (type: NodeType) => string; dx?: number; dy?: number }
  | { type: 'sync-instance'; id: string; makeId: (type: NodeType) => string }
  | { type: 'swap-instance'; id: string; targetId: string; makeId: (type: NodeType) => string }
  | {
      type: 'create-variant-set';
      ids: string[];
      makeId: (type: NodeType) => string;
      name?: string;
      property?: string;
    }
  | {
      type: 'switch-variant';
      id: string;
      targetId: string;
      makeId: (type: NodeType) => string;
    }
  | { type: 'add-variant'; id: string; makeId: (type: NodeType) => string; value?: string }
  | {
      type: 'create-variant-combo';
      setId: string;
      props: Record<string, string>;
      makeId: (type: NodeType) => string;
      sourceId?: string;
    }
  | { type: 'add-variant-property'; setId: string; name: string; value?: string };

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
  let nextDoc: GromaDoc = {
    ...doc,
    nodes: { ...doc.nodes, [parentId]: { ...parent, children }, [node.id]: node },
  };
  if (needsAutoLayoutReflow(nextDoc, node.id)) nextDoc = reflowPageFrom(nextDoc, node.id);
  return {
    doc: nextDoc,
    node: nextDoc.nodes[node.id] ?? node,
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
  let nextDoc: GromaDoc = { ...doc, nodes };
  if (needsAutoLayoutReflow(nextDoc, parent.id)) nextDoc = reflowPageFrom(nextDoc, parent.id);
  return {
    doc: nextDoc,
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

function scaleContainerChildren(
  nodes: Record<string, SceneNode>,
  id: string,
  sx: number,
  sy: number,
): void {
  const node = nodes[id];
  if (!node) return;
  for (const childId of node.children) {
    const child = nodes[childId];
    if (!child) continue;
    nodes[childId] = {
      ...child,
      x: Math.round(child.x * sx * 100) / 100,
      y: Math.round(child.y * sy * 100) / 100,
      w: Math.round(child.w * sx * 100) / 100,
      h: Math.round(child.h * sy * 100) / 100,
    };
    if (child.type === 'boolean' || child.type === 'group') {
      scaleContainerChildren(nodes, childId, sx, sy);
    }
  }
}

function scaleBooleanGroup(
  doc: GromaDoc,
  id: string,
  before: SceneNode,
  after: SceneNode,
): GromaDoc {
  const sx = after.w / Math.max(0.01, before.w);
  const sy = after.h / Math.max(0.01, before.h);
  const nodes: Record<string, SceneNode> = { ...doc.nodes, [id]: after };
  scaleContainerChildren(nodes, id, sx, sy);
  return { ...doc, nodes };
}

function patchNode(doc: GromaDoc, id: string, patch: NodePatch): CommandResult {
  const before = requireNode(doc, id);
  const afterBase: SceneNode = { ...before, ...sanitizePatch(patch) };
  const resized = before.w !== afterBase.w || before.h !== afterBase.h;
  let nextDoc: GromaDoc =
    afterBase.type === 'boolean' && resized
      ? scaleBooleanGroup(doc, id, before, afterBase)
      : (afterBase.type === 'frame' || afterBase.type === 'section') && resized
        ? applyConstraintsOnResize(doc, id, before, afterBase)
        : { ...doc, nodes: { ...doc.nodes, [id]: afterBase } };

  // 自动布局：容器自身或父容器开启时，任何尺寸/内容补丁后都重排同一页。
  const afterBeforeReflow = nextDoc.nodes[id] ?? afterBase;
  const layoutChanged = needsAutoLayoutReflow(nextDoc, id);
  if (layoutChanged) nextDoc = reflowPageFrom(nextDoc, id);
  const refreshed = refreshBooleanChain(nextDoc, id);
  nextDoc = refreshed.doc;
  const after = nextDoc.nodes[id] ?? afterBeforeReflow;

  const beforeNodes: Record<string, SceneNode> = { [id]: before };
  const afterNodes: Record<string, SceneNode> = { [id]: after };
  for (const changedId of refreshed.changedIds) {
    const prev = doc.nodes[changedId];
    const next = nextDoc.nodes[changedId];
    if (!prev || !next) continue;
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      beforeNodes[changedId] = prev;
      afterNodes[changedId] = next;
    }
  }
  if (layoutChanged) {
    for (const key of Object.keys(doc.nodes)) {
      const prev = doc.nodes[key];
      const next = nextDoc.nodes[key];
      if (!next || prev === next) continue;
      if (JSON.stringify(prev) !== JSON.stringify(next)) {
        beforeNodes[key] = prev;
        afterNodes[key] = next;
      }
    }
  }

  return {
    doc: nextDoc,
    before,
    after,
    beforeNodes,
    afterNodes,
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
  let nextDoc: GromaDoc = { ...doc, nodes };
  if (needsAutoLayoutReflow(nextDoc, root.id)) nextDoc = reflowPageFrom(nextDoc, root.id);
  return { doc: nextDoc, node: nextDoc.nodes[root.id] ?? root, parentId, index, subtree };
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
  let nextDoc: GromaDoc = {
    ...doc,
    nodes: { ...doc.nodes, ...clones, [parent.id]: { ...parent, children } },
  };
  if (needsAutoLayoutReflow(nextDoc, root.id)) nextDoc = reflowPageFrom(nextDoc, root.id);
  return {
    doc: nextDoc,
    node: nextDoc.nodes[root.id] ?? root,
    parentId: parent.id,
    index: at,
    subtree: clones,
  };
}

/**
 * 把另一个工程里的主组件复制进当前工程：全部节点换新 id，
 * 只保留可直接物化的字面属性。外部依赖（图片/样式/变量/实例）在库里
 * 已经过滤，这里再兜底剥掉，避免复制出悬空引用。
 */
export function importComponentFromDoc(
  doc: GromaDoc,
  source: GromaDoc,
  sourceId: string,
  makeId: (type: NodeType) => string,
  parentId: string,
  x: number,
  y: number,
  sourceRef?: LibrarySource,
): CommandResult {
  const sourceRoot = source.nodes[sourceId];
  if (!sourceRoot || sourceRoot.type !== 'frame' || !sourceRoot.isComponent) {
    throw new Error('只能导入另一个工程里的主组件');
  }
  if (sourceRoot.variantSetId) throw new Error('变体组件需要连同变体集导入，暂不支持');
  const parent = doc.nodes[parentId];
  if (!parent) throw new Error('目标容器不存在');

  const originals: Record<string, SceneNode> = {};
  const walk = (id: string) => {
    const node = source.nodes[id];
    if (!node) return;
    originals[id] = node;
    for (const childId of node.children) walk(childId);
  };
  walk(sourceId);

  const idMap = new Map<string, string>();
  for (const [oldId, node] of Object.entries(originals)) idMap.set(oldId, makeId(node.type));

  const clones: Record<string, SceneNode> = {};
  for (const [oldId, node] of Object.entries(originals)) {
    const cloneId = idMap.get(oldId) as string;
    const isRoot = oldId === sourceId;
    const clean: SceneNode = {
      ...node,
      id: cloneId,
      parentId: isRoot ? parentId : (idMap.get(node.parentId ?? '') ?? parentId),
      children: node.children.map((childId) => idMap.get(childId)).filter((v): v is string => Boolean(v)),
      ...(isRoot
        ? {
            x,
            y,
            isComponent: true,
            librarySource: sourceRef
              ? {
                  ...sourceRef,
                  nodeId: sourceId,
                  nodeName: sourceRoot.name,
                  version: sourceRoot.libraryPublication?.version ?? 0,
                  publishedAt: sourceRoot.libraryPublication?.publishedAt,
                }
              : undefined,
            libraryPublication: undefined,
          }
        : { isComponent: undefined, librarySource: undefined, libraryPublication: undefined }),
      variantSetId: undefined,
      variantProps: undefined,
      componentOf: undefined,
      instanceOverrides: undefined,
      styleRefs: undefined,
      variableBindings: undefined,
      prototype: undefined,
      assetId: undefined,
      imageFill: undefined,
    };
    clones[cloneId] = clean;
  }

  const root = clones[idMap.get(sourceId) as string];
  const at = parent.children.length;
  return {
    doc: {
      ...doc,
      nodes: {
        ...doc.nodes,
        ...clones,
        [parentId]: { ...parent, children: [...parent.children, root.id] },
      },
    },
    node: root,
    parentId,
    index: at,
    subtree: clones,
  };
}

/**
 * 用来源工程的最新主组件替换当前工程里的导入副本。
 * 保留目标主组件 id / 位置，所以已有实例的 componentOf 不会断；
 * 子树换新 id，旧覆盖由调用方按同步流程重放。
 */
export function refreshComponentFromDoc(
  doc: GromaDoc,
  targetId: string,
  source: GromaDoc,
  sourceId: string,
  makeId: (type: NodeType) => string,
): CommandResult {
  const target = doc.nodes[targetId];
  if (!target || target.type !== 'frame' || !target.isComponent) throw new Error('目标不是主组件');
  if (!target.parentId) throw new Error('主组件没有父容器');
  if (!target.librarySource) throw new Error('目标不是从本机库导入的主组件');
  const parent = doc.nodes[target.parentId];
  if (!parent) throw new Error('主组件父容器不存在');
  const sourceRoot = source.nodes[sourceId];
  if (!sourceRoot || sourceRoot.type !== 'frame' || !sourceRoot.isComponent) throw new Error('来源主组件不存在');
  if (sourceRoot.variantSetId) throw new Error('变体组件暂不支持跨工程更新');

  const oldOriginals = collectSubtree(doc, targetId);
  const sourceOriginals = collectSubtree(source, sourceId);
  const idMap = new Map<string, string>();
  for (const [oldId, node] of Object.entries(sourceOriginals)) {
    idMap.set(oldId, oldId === sourceId ? targetId : makeId(node.type));
  }

  const nextNodes = { ...doc.nodes };
  for (const oldId of Object.keys(oldOriginals)) delete nextNodes[oldId];

  const clones: Record<string, SceneNode> = {};
  for (const [oldId, node] of Object.entries(sourceOriginals)) {
    const nextId = idMap.get(oldId) as string;
    const isRoot = oldId === sourceId;
    clones[nextId] = {
      ...node,
      id: nextId,
      parentId: isRoot ? target.parentId : (idMap.get(node.parentId ?? '') ?? target.parentId),
      children: node.children.map((childId) => idMap.get(childId)).filter((value): value is string => Boolean(value)),
      ...(isRoot
        ? {
            x: target.x,
            y: target.y,
            isComponent: true,
            librarySource: {
              ...target.librarySource,
              nodeId: sourceId,
              nodeName: sourceRoot.name,
              version: sourceRoot.libraryPublication?.version ?? 0,
              publishedAt: sourceRoot.libraryPublication?.publishedAt,
            },
            libraryPublication: undefined,
          }
        : { isComponent: undefined, librarySource: undefined, libraryPublication: undefined }),
      variantSetId: undefined,
      variantProps: undefined,
      componentOf: undefined,
      instanceOverrides: undefined,
      styleRefs: undefined,
      variableBindings: undefined,
      prototype: undefined,
      assetId: undefined,
      imageFill: undefined,
    };
    nextNodes[nextId] = clones[nextId];
  }

  return {
    doc: { ...doc, nodes: nextNodes },
    node: clones[targetId],
    parentId: target.parentId,
    index: parent.children.indexOf(targetId),
    subtree: clones,
  };
}

/**
 * 把当前独立主组件发布到本机库，版本号递增。
 * 只写发布记录，不改组件内容；订阅方靠版本号判断有没有新版本。
 */
export function publishComponent(doc: GromaDoc, id: string, publishedAt = new Date().toISOString()): CommandResult {
  const node = doc.nodes[id];
  if (!node || node.type !== 'frame' || !node.isComponent) throw new Error('只有主组件能发布到本机库');
  if (node.variantSetId || node.isVariantSet) throw new Error('变体组件暂不支持发布到本机库');
  if (node.librarySource) throw new Error('从本机库导入的组件不能再次发布');
  if (!publishedAt) throw new Error('发布时间不能为空');
  const version = (node.libraryPublication?.version ?? 0) + 1;
  const after: SceneNode = { ...node, libraryPublication: { version, publishedAt } };
  return {
    doc: { ...doc, nodes: { ...doc.nodes, [id]: after } },
    node: after,
    before: node,
    after,
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

function booleanGroupNodes(
  doc: GromaDoc,
  ids: string[],
  op: BooleanOp,
  makeId: (type: NodeType) => string,
  name?: string,
): CommandResult {
  const unique = [...new Set(ids)];
  if (unique.length < 2) throw new Error('布尔组至少需要两个对象');
  const nodes = unique.map((id) => requireNode(doc, id));
  if (nodes.some((node) => node.type === 'page' || node.parentId === null)) throw new Error('页面根节点不能参与布尔');
  if (nodes.some((node) => node.locked)) throw new Error('锁定节点不能参与布尔');
  const parentId = nodes[0].parentId as string;
  if (nodes.some((node) => node.parentId !== parentId)) throw new Error('布尔对象必须在同一父级');
  const parent = requireNode(doc, parentId);
  const orderedSourceIds = parent.children.filter((id) => unique.includes(id));
  if (orderedSourceIds.length < 2) throw new Error('布尔对象必须都在父级 children 中');

  const boolId = makeId('boolean');
  if (doc.nodes[boolId]) throw new Error(`节点 id 已存在：${boolId}`);
  const build = booleanGroupBuild(doc, orderedSourceIds, op, boolId, name);
  if ('error' in build) throw new Error(build.error);

  const beforeNodes: Record<string, SceneNode> = { [parent.id]: parent };
  for (const sourceId of orderedSourceIds) beforeNodes[sourceId] = requireNode(doc, sourceId);

  const firstIndex = parent.children.indexOf(orderedSourceIds[0]);
  const children = parent.children.filter((id) => !orderedSourceIds.includes(id));
  const insertAt = parent.children.filter((id, index) => !orderedSourceIds.includes(id) && index < firstIndex).length;
  children.splice(insertAt, 0, boolId);

  const afterNodes: Record<string, SceneNode> = {
    [parent.id]: { ...parent, children },
    [boolId]: build.node,
    ...build.sourcePatches,
  };
  return {
    doc: { ...doc, nodes: { ...doc.nodes, ...afterNodes } },
    node: build.node,
    parentId,
    index: insertAt,
    beforeNodes,
    afterNodes,
    undoRemove: [boolId],
  };
}

function ungroupNode(doc: GromaDoc, id: string): CommandResult {
  const group = requireNode(doc, id);
  if (group.type !== 'group' && group.type !== 'boolean') throw new Error('只能解散分组或布尔组节点');
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

function reorderNode(doc: GromaDoc, id: string, toIndex: number): CommandResult {
  const node = requireNode(doc, id);
  if (!node.parentId) throw new Error('页面根节点不能重排');
  const parent = requireNode(doc, node.parentId);
  const current = parent.children.indexOf(id);
  if (current < 0) throw new Error('节点不在父节点 children 中');
  const target = Math.max(0, Math.min(Math.round(toIndex), parent.children.length - 1));
  if (target === current) return { doc, beforeNodes: {}, afterNodes: {}, parentId: parent.id, index: current };

  const children = [...parent.children];
  children.splice(current, 1);
  children.splice(target, 0, id);
  let nextDoc: GromaDoc = {
    ...doc,
    nodes: { ...doc.nodes, [parent.id]: { ...parent, children } },
  };
  if (parent.layout) nextDoc = reflowPageFrom(nextDoc, parent.id);

  const beforeNodes: Record<string, SceneNode> = {};
  const afterNodes: Record<string, SceneNode> = {};
  for (const key of Object.keys(doc.nodes)) {
    const prev = doc.nodes[key];
    const next = nextDoc.nodes[key];
    if (!next || prev === next) continue;
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      beforeNodes[key] = prev;
      afterNodes[key] = next;
    }
  }
  return { doc: nextDoc, parentId: parent.id, index: target, beforeNodes, afterNodes, childIds: children };
}

function reparentNode(doc: GromaDoc, id: string, parentId: string, toIndex: number): CommandResult {
  const node = requireNode(doc, id);
  if (!node.parentId) throw new Error('页面根节点不能移动');
  if (id === parentId) throw new Error('不能移动到自己里面');
  const targetParent = requireNode(doc, parentId);
  if (node.parentId === parentId) return reorderNode(doc, id, toIndex);

  let walker: SceneNode | undefined = targetParent;
  while (walker) {
    if (walker.id === id) throw new Error('不能把父级移进自己的子树');
    walker = walker.parentId ? doc.nodes[walker.parentId] : undefined;
  }

  const oldParent = requireNode(doc, node.parentId);
  if (node.locked) throw new Error('锁定的图层不能移动');

  const abs = absolutePosition(doc, id);
  const targetAbs = targetParent.type === 'page' ? { x: 0, y: 0 } : absolutePosition(doc, targetParent.id);
  const targetIndex = Math.max(0, Math.min(Math.round(toIndex), targetParent.children.length));

  const oldChildren = oldParent.children.filter((childId) => childId !== id);
  const newChildren = [...targetParent.children];
  newChildren.splice(targetIndex, 0, id);
  const moved: SceneNode = {
    ...node,
    parentId,
    x: Math.round(abs.x - targetAbs.x),
    y: Math.round(abs.y - targetAbs.y),
  };

  let nextDoc: GromaDoc = {
    ...doc,
    nodes: {
      ...doc.nodes,
      [oldParent.id]: { ...oldParent, children: oldChildren },
      [targetParent.id]: { ...targetParent, children: newChildren },
      [id]: moved,
    },
  };
  if (oldParent.layout) nextDoc = reflowPageFrom(nextDoc, oldParent.id);
  if (targetParent.layout) nextDoc = reflowPageFrom(nextDoc, targetParent.id);

  const beforeNodes: Record<string, SceneNode> = {};
  const afterNodes: Record<string, SceneNode> = {};
  for (const key of Object.keys(doc.nodes)) {
    const prev = doc.nodes[key];
    const next = nextDoc.nodes[key];
    if (!next || prev === next) continue;
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      beforeNodes[key] = prev;
      afterNodes[key] = next;
    }
  }
  return { doc: nextDoc, parentId, index: targetIndex, beforeNodes, afterNodes, childIds: newChildren };
}

function createComponentInstance(
  doc: GromaDoc,
  id: string,
  makeId: (type: NodeType) => string,
  dx = 0,
  dy?: number,
): CommandResult {
  const master = requireNode(doc, id);
  if (master.type !== 'frame' || !master.isComponent) throw new Error('只能从主组件画板创建实例');
  const result = cloneNode(doc, id, makeId, dx, dy ?? master.h + 40, ' 实例');
  const root = result.node;
  if (!root) throw new Error('实例创建失败');
  let nextRoot: SceneNode = {
    ...root,
    isComponent: undefined,
    componentOf: master.id,
    variantSetId: undefined,
    variantProps: undefined,
    librarySource: undefined,
  };
  let nextDoc = result.doc;
  let nextParentId = result.parentId as string;
  let nextIndex = result.index ?? 0;

  // 变体实例不能生在变体集内部：移到变体集外侧右方，保持图层干净。
  if (master.variantSetId) {
    const set = doc.nodes[master.variantSetId];
    if (set?.isVariantSet && set.parentId) {
      const setParent = requireNode(doc, set.parentId);
      nextParentId = set.parentId;
      nextIndex = setParent.children.length;
      nextRoot = {
        ...nextRoot,
        parentId: setParent.id,
        x: Math.round(set.x + set.w + 40),
        y: Math.round(set.y),
      };
      const setChildren = (nextDoc.nodes[set.id]?.children ?? set.children).filter((childId) => childId !== root.id);
      nextDoc = {
        ...nextDoc,
        nodes: {
          ...nextDoc.nodes,
          [set.id]: { ...(nextDoc.nodes[set.id] ?? set), children: setChildren },
          [setParent.id]: { ...(nextDoc.nodes[setParent.id] ?? setParent), children: [...setParent.children, root.id] },
        },
      };
    }
  }

  const nodes = { ...nextDoc.nodes, [root.id]: nextRoot };
  return {
    ...result,
    doc: { ...nextDoc, nodes },
    node: nextRoot,
    parentId: nextParentId,
    index: nextIndex,
    subtree: { ...(result.subtree ?? {}), [root.id]: nextRoot },
  };
}

function syncComponentInstance(
  doc: GromaDoc,
  id: string,
  makeId: (type: NodeType) => string,
  masterIdOverride?: string,
): CommandResult {
  const root = requireNode(doc, id);
  if (root.type !== 'frame' || !root.componentOf) throw new Error('只有组件实例能同步');
  const masterId = masterIdOverride ?? root.componentOf;
  const master = doc.nodes[masterId];
  if (!master || master.type !== 'frame' || !master.isComponent) throw new Error('主组件不存在或已失效');
  if (collectSubtree(doc, master.id)[root.id]) throw new Error('实例不能位于主组件自身内部');

  const oldSubtree = collectSubtree(doc, root.id);
  const masterSubtree = collectSubtree(doc, master.id);
  const descendants = Object.values(masterSubtree).filter((node) => node.id !== master.id);
  const idMap = new Map<string, string>();
  for (const node of descendants) idMap.set(node.id, makeId(node.type));

  const clones: Record<string, SceneNode> = {};
  for (const node of descendants) {
    const cloneId = idMap.get(node.id) as string;
    clones[cloneId] = {
      ...node,
      id: cloneId,
      parentId: node.parentId === master.id ? root.id : (idMap.get(node.parentId ?? '') ?? node.parentId),
      children: node.children.map((childId) => idMap.get(childId)).filter((childId): childId is string => Boolean(childId)),
    };
  }

  const nextRoot: SceneNode = {
    ...master,
    id: root.id,
    parentId: root.parentId,
    name: root.name,
    x: root.x,
    y: root.y,
    rotation: root.rotation,
    visible: root.visible,
    locked: root.locked,
    opacity: root.opacity,
    isComponent: undefined,
    isVariantSet: undefined,
    variantSetId: undefined,
    variantProps: undefined,
    componentOf: master.id,
    librarySource: undefined,
    instanceOverrides: root.instanceOverrides,
    children: master.children.map((childId) => idMap.get(childId)).filter((childId): childId is string => Boolean(childId)),
  };

  const nodes = { ...doc.nodes };
  for (const oldId of Object.keys(oldSubtree)) if (oldId !== root.id) delete nodes[oldId];
  Object.assign(nodes, clones);
  nodes[root.id] = nextRoot;
  let nextDoc: GromaDoc = { ...doc, nodes };
  nextDoc = applyInstanceOverrides(nextDoc, root.id);
  if (needsAutoLayoutReflow(nextDoc, root.id)) nextDoc = reflowPageFrom(nextDoc, root.id);

  const beforeNodes: Record<string, SceneNode> = {};
  const afterNodes: Record<string, SceneNode> = {};
  const allIds = new Set([...Object.keys(doc.nodes), ...Object.keys(nextDoc.nodes)]);
  for (const key of allIds) {
    const prev = doc.nodes[key];
    const next = nextDoc.nodes[key];
    if (!prev || !next) continue;
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      beforeNodes[key] = prev;
      afterNodes[key] = next;
    }
  }

  return {
    doc: nextDoc,
    node: nextDoc.nodes[root.id] ?? nextRoot,
    beforeNodes,
    afterNodes,
    undoRemove: Object.keys(clones),
    redoRemove: Object.keys(oldSubtree).filter((oldId) => oldId !== root.id),
  };
}

/**
 * 找到被编辑节点所属的最近主组件；编辑实例内部时返回 null，避免把实例改动反灌主组件。
 */
export function masterOfEditedNode(doc: GromaDoc, id: string): string | null {
  let current: SceneNode | undefined = doc.nodes[id];
  while (current) {
    if (current.componentOf) return null;
    if (current.isComponent) return current.id;
    current = current.parentId ? doc.nodes[current.parentId] : undefined;
  }
  return null;
}

/**
 * 主组件发生改动后，把所有实例重新按主组件生成一遍，保留实例自身的覆盖。
 * 单个实例失败不拖垮其它实例。
 */
export function syncInstancesOfMaster(
  doc: GromaDoc,
  masterId: string,
  makeId: (type: NodeType) => string,
): GromaDoc {
  const master = doc.nodes[masterId];
  if (!master?.isComponent) return doc;
  const instanceIds = Object.values(doc.nodes)
    .filter((node) => node.type === 'frame' && node.componentOf === masterId)
    .map((node) => node.id);
  let next = doc;
  for (const instanceId of instanceIds) {
    if (!next.nodes[instanceId]) continue;
    try {
      next = applyCommand(next, { type: 'sync-instance', id: instanceId, makeId }).doc;
    } catch {
      // 单个失效实例不影响其余实例
    }
  }
  return next;
}

function createVariantSet(
  doc: GromaDoc,
  ids: string[],
  makeId: (type: NodeType) => string,
  name?: string,
  property = '状态',
): CommandResult {
  const unique = [...new Set(ids)];
  if (unique.length < 2) throw new Error('至少选择两个主组件才能建立变体集');
  const variants = unique.map((id) => requireNode(doc, id));
  const parentId = variants[0].parentId;
  if (!parentId) throw new Error('主组件没有父节点');
  const parent = requireNode(doc, parentId);
  if (!variants.every((node) => node.parentId === parentId)) throw new Error('变体主组件必须在同一父级');
  if (!variants.every((node) => node.type === 'frame' && node.isComponent)) throw new Error('只有主组件画板能合并为变体集');
  if (variants.some((node) => node.isVariantSet || node.variantSetId || node.componentOf)) {
    throw new Error('已是变体或实例的画板不能再合并');
  }
  if (!parent.children.every((id) => doc.nodes[id])) throw new Error('父级图层表损坏');

  const ordered = [...variants].sort(
    (a, b) => parent.children.indexOf(a.id) - parent.children.indexOf(b.id),
  );
  const minX = Math.min(...ordered.map((node) => node.x));
  const minY = Math.min(...ordered.map((node) => node.y));
  const maxX = Math.max(...ordered.map((node) => node.x + node.w));
  const maxY = Math.max(...ordered.map((node) => node.y + node.h));
  const setId = makeId('frame');
  const setName = name?.trim() || `变体集 ${Object.values(doc.nodes).filter((node) => node.isVariantSet).length + 1}`;
  const firstIndex = parent.children.findIndex((id) => unique.includes(id));
  const remaining = parent.children.filter((id) => !unique.includes(id));
  const insertAt = parent.children.slice(0, firstIndex).filter((id) => !unique.includes(id)).length;

  const set: SceneNode = {
    id: setId,
    type: 'frame',
    name: setName,
    parentId,
    children: ordered.map((node) => node.id),
    x: Math.round(minX),
    y: Math.round(minY),
    w: Math.max(1, Math.round(maxX - minX)),
    h: Math.max(1, Math.round(maxY - minY)),
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    clipContent: false,
    isVariantSet: true,
    fills: [],
    cornerRadius: 0,
  };

  const beforeNodes: Record<string, SceneNode> = { [parentId]: parent };
  const afterNodes: Record<string, SceneNode> = {};
  const moved: Record<string, SceneNode> = {};
  const propName = property.trim() || '状态';
  ordered.forEach((node, index) => {
    beforeNodes[node.id] = node;
    moved[node.id] = {
      ...node,
      parentId: setId,
      x: Math.round(node.x - minX),
      y: Math.round(node.y - minY),
      variantSetId: setId,
      variantProps: node.variantProps ?? { [propName]: index === 0 ? '默认' : `变体 ${index + 1}` },
    };
  });
  const nextParent: SceneNode = { ...parent, children: [...remaining] };
  nextParent.children.splice(insertAt, 0, setId);
  afterNodes[parentId] = nextParent;
  afterNodes[setId] = set;
  Object.assign(afterNodes, moved);

  const nodes = { ...doc.nodes, ...afterNodes };
  return {
    doc: { ...doc, nodes },
    node: set,
    parentId,
    index: insertAt,
    subtree: { [setId]: set, ...moved },
    beforeNodes,
    afterNodes,
    undoRemove: [setId],
    redoRemove: [],
    childIds: set.children,
  };
}

function nextVariantProps(base: SceneNode, siblings: SceneNode[]): Record<string, string> {
  const props = { ...(base.variantProps ?? {}) };
  const names = Object.keys(props).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  const first = names[0] ?? '状态';
  let index = siblings.length + 1;
  while (true) {
    props[first] = index === 1 ? '默认' : `变体 ${index}`;
    const combo = Object.keys(props).sort().map((name) => `${name}=${props[name]}`).join('|');
    const taken = siblings.some((node) => Object.keys(node.variantProps ?? {}).sort().map((name) => `${name}=${node.variantProps?.[name]}`).join('|') === combo);
    if (!taken) return props;
    index += 1;
  }
}

function addVariant(
  doc: GromaDoc,
  id: string,
  makeId: (type: NodeType) => string,
  value?: string,
): CommandResult {
  const base = requireNode(doc, id);
  if (base.type !== 'frame' || !base.isComponent || !base.variantSetId) throw new Error('只能从变体主组件新增变体');
  const set = requireNode(doc, base.variantSetId);
  if (!set.isVariantSet || set.type !== 'frame') throw new Error('变体集已失效');
  const siblings = set.children.map((childId) => doc.nodes[childId]).filter((node): node is SceneNode => Boolean(node));
  const cloned = cloneNode(doc, id, makeId, base.w + 40, 0, ' 变体');
  const clone = cloned.node;
  if (!clone) throw new Error('新增变体失败');
  const props = { ...nextVariantProps(base, siblings) };
  if (value?.trim()) {
    const first = Object.keys(props).sort()[0] ?? '状态';
    props[first] = value.trim();
  }
  const variant: SceneNode = { ...clone, variantSetId: set.id, variantProps: props };
  const currentSet = (cloned.doc.nodes[set.id] ?? set) as SceneNode;
  const maxRight = Math.max(...currentSet.children.map((childId) => (cloned.doc.nodes[childId]?.x ?? 0) + (cloned.doc.nodes[childId]?.w ?? 0)), variant.x + variant.w);
  const maxBottom = Math.max(...currentSet.children.map((childId) => (cloned.doc.nodes[childId]?.y ?? 0) + (cloned.doc.nodes[childId]?.h ?? 0)), variant.y + variant.h);
  const nextSet: SceneNode = { ...currentSet, w: Math.max(currentSet.w, Math.round(maxRight)), h: Math.max(currentSet.h, Math.round(maxBottom)) };
  const nodes = { ...cloned.doc.nodes, [variant.id]: variant, [set.id]: nextSet };
  const afterNodes = { ...(cloned.afterNodes ?? {}), [variant.id]: variant, [set.id]: nextSet };
  const beforeNodes = { ...(cloned.beforeNodes ?? {}), [set.id]: set };
  return {
    ...cloned,
    doc: { ...cloned.doc, nodes },
    node: variant,
    subtree: { ...(cloned.subtree ?? {}), [variant.id]: variant },
    beforeNodes,
    afterNodes,
    undoRemove: Object.keys(cloned.subtree ?? {}),
    redoRemove: [],
  };
}

function variantComboKey(props: Record<string, string>): string {
  return Object.keys(props)
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
    .map((name) => `${name}=${props[name]}`)
    .join('|');
}

function createVariantCombo(
  doc: GromaDoc,
  setId: string,
  props: Record<string, string>,
  makeId: (type: NodeType) => string,
  sourceId?: string,
): CommandResult {
  const set = requireNode(doc, setId);
  if (set.type !== 'frame' || !set.isVariantSet) throw new Error('目标不是变体集');
  const siblings = set.children
    .map((id) => doc.nodes[id])
    .filter((node): node is SceneNode => Boolean(node?.isComponent));
  if (siblings.length === 0) throw new Error('变体集为空');
  const names = [...new Set(siblings.flatMap((node) => Object.keys(node.variantProps ?? {})))];
  const keys = Object.keys(props);
  if (keys.length !== names.length || names.some((name) => !keys.includes(name))) throw new Error('变体属性必须与集合一致');
  if (keys.some((name) => !props[name]?.trim())) throw new Error('变体属性值不能为空');
  const combo = variantComboKey(props);
  if (siblings.some((node) => variantComboKey(node.variantProps ?? {}) === combo)) throw new Error('重复变体组合');
  const source = (sourceId ? doc.nodes[sourceId] : siblings[siblings.length - 1]) ?? siblings[siblings.length - 1];
  if (!source || !siblings.some((node) => node.id === source.id)) throw new Error('来源变体不存在');
  const cloned = cloneNode(doc, source.id, makeId, 0, 0, ' 变体');
  const clone = cloned.node;
  if (!clone) throw new Error('新增变体失败');
  const right = Math.max(...set.children.map((id) => (doc.nodes[id]?.x ?? 0) + (doc.nodes[id]?.w ?? 0)), 0);
  const targetNames = [...names];
  let targetX = Math.round(right + 32);
  let targetY = 0;
  if (targetNames.length === 2) {
    const [rowName, colName] = targetNames;
    const sameRow = siblings.find((node) => node.variantProps?.[rowName] === props[rowName] && node.variantProps?.[colName] !== props[colName]);
    const sameCol = siblings.find((node) => node.variantProps?.[colName] === props[colName] && node.variantProps?.[rowName] !== props[rowName]);
    if (sameRow) targetX = sameRow.x;
    if (sameCol) targetY = sameCol.y;
  }
  const occupied = siblings.some((node) => Math.abs(node.x - targetX) < 1 && Math.abs(node.y - targetY) < 1);
  if (occupied) {
    targetX = Math.round(right + 32);
    targetY = 0;
  }
  const variant: SceneNode = {
    ...clone,
    x: Math.round(targetX),
    y: Math.round(targetY),
    name: `${set.name} / ${targetNames.map((name) => props[name]).join(' / ')}`.slice(0, 40),
    variantSetId: set.id,
    variantProps: Object.fromEntries(targetNames.map((name) => [name, props[name].trim()])),
  };
  const nextSet: SceneNode = {
    ...(cloned.doc.nodes[set.id] ?? set),
    children: [...((cloned.doc.nodes[set.id] ?? set).children)],
    w: Math.max(set.w, Math.round(variant.x + variant.w)),
    h: Math.max(set.h, Math.round(variant.y + variant.h)),
  };
  const nodes = { ...cloned.doc.nodes, [variant.id]: variant, [set.id]: nextSet };
  return {
    ...cloned,
    doc: { ...cloned.doc, nodes },
    node: variant,
    subtree: { ...(cloned.subtree ?? {}), [variant.id]: variant },
    beforeNodes: { [set.id]: set },
    afterNodes: { [set.id]: nextSet, [variant.id]: variant },
    undoRemove: Object.keys(cloned.subtree ?? {}),
    redoRemove: [],
  };
}

function addVariantProperty(
  doc: GromaDoc,
  setId: string,
  name: string,
  value?: string,
): CommandResult {
  const set = requireNode(doc, setId);
  if (set.type !== 'frame' || !set.isVariantSet) throw new Error('目标不是变体集');
  const key = name.trim();
  if (!key) throw new Error('属性名不能为空');
  const variants = set.children
    .map((id) => doc.nodes[id])
    .filter((node): node is SceneNode => Boolean(node?.isComponent));
  if (variants.length === 0) throw new Error('变体集为空');
  if (variants.some((node) => Object.prototype.hasOwnProperty.call(node.variantProps ?? {}, key))) throw new Error('属性已存在');
  const nextValue = value?.trim() || '默认';
  const beforeNodes: Record<string, SceneNode> = { [set.id]: set };
  const afterNodes: Record<string, SceneNode> = {};
  for (const node of variants) {
    beforeNodes[node.id] = node;
    afterNodes[node.id] = {
      ...node,
      variantProps: { ...(node.variantProps ?? {}), [key]: nextValue },
    };
  }
  return {
    doc: { ...doc, nodes: { ...doc.nodes, ...afterNodes } },
    node: set,
    beforeNodes,
    afterNodes,
  };
}

function switchVariant(
  doc: GromaDoc,
  id: string,
  targetId: string,
  makeId: (type: NodeType) => string,
): CommandResult {
  const instance = requireNode(doc, id);
  if (instance.type !== 'frame' || !instance.componentOf) throw new Error('只有组件实例能切换变体');
  const current = doc.nodes[instance.componentOf];
  const target = doc.nodes[targetId];
  if (!current || !current.isComponent) throw new Error('当前主组件已失效');
  if (!target || target.type !== 'frame' || !target.isComponent) throw new Error('目标变体不存在');
  if (!current.variantSetId || current.variantSetId !== target.variantSetId) throw new Error('只能切换同一变体集内的变体');
  return syncComponentInstance(doc, id, makeId, targetId);
}

/** 替换实例主组件：保留位置，采用目标尺寸与结构；同路径同类型同名的覆盖继续沿用。 */
function swapComponentInstance(
  doc: GromaDoc,
  id: string,
  targetId: string,
  makeId: (type: NodeType) => string,
): CommandResult {
  const instance = requireNode(doc, id);
  if (instance.type !== 'frame' || !instance.componentOf) throw new Error('只有组件实例能替换主组件');
  const current = doc.nodes[instance.componentOf];
  const target = doc.nodes[targetId];
  if (!current?.isComponent) throw new Error('当前主组件已失效');
  if (!target || target.type !== 'frame' || !target.isComponent) throw new Error('目标主组件不存在');
  if (target.id === current.id) throw new Error('实例已经指向这个主组件');
  if (target.isVariantSet) throw new Error('变体集不能直接作为实例主组件');
  if (collectSubtree(doc, instance.id)[target.id]) throw new Error('实例不能替换成自身内部的组件');
  const overrides = remapOverridesForSwap(doc, instance.instanceOverrides, current.id, target.id);
  const nextDoc: GromaDoc = {
    ...doc,
    nodes: { ...doc.nodes, [instance.id]: { ...instance, instanceOverrides: overrides } },
  };
  const result = syncComponentInstance(nextDoc, id, makeId, target.id);
  if (result.beforeNodes) result.beforeNodes[instance.id] = instance;
  return result;
}
export function applyCommand(doc: GromaDoc, command: SceneCommand): CommandResult {
  const result = dispatchCommand(doc, command);
  if (!Object.values(result.doc.nodes).some((node) => node.type === 'boolean')) return result;
  return { ...result, doc: normalizeBooleanGroups(result.doc) };
}

function booleanDepth(doc: GromaDoc, id: string): number {
  let depth = 0;
  let cursor = doc.nodes[id]?.parentId ?? null;
  let guard = 0;
  while (cursor && guard < 64) {
    depth += 1;
    cursor = doc.nodes[cursor]?.parentId ?? null;
    guard += 1;
  }
  return depth;
}

/** 结构类命令后统一重算布尔缓存，删除/恢复/重排子层也能保持画面正确。 */
function normalizeBooleanGroups(doc: GromaDoc): GromaDoc {
  let next = doc;
  const ids = Object.values(next.nodes)
    .filter((node) => node.type === 'boolean')
    .map((node) => node.id)
    .sort((a, b) => booleanDepth(next, b) - booleanDepth(next, a));
  for (const id of ids) {
    const refreshed = refreshBooleanNode(next, id);
    if (!refreshed) continue;
    next = { ...next, nodes: { ...next.nodes, [id]: refreshed.node, ...refreshed.childPatches } };
  }
  return next;
}

function dispatchCommand(doc: GromaDoc, command: SceneCommand): CommandResult {
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
    case 'boolean':
      return booleanGroupNodes(doc, command.ids, command.op, command.makeId, command.name);
    case 'ungroup':
      return ungroupNode(doc, command.id);
    case 'reorder':
      return reorderNode(doc, command.id, command.toIndex);
    case 'reparent':
      return reparentNode(doc, command.id, command.parentId, command.toIndex);
    case 'create-instance':
      return createComponentInstance(doc, command.id, command.makeId, command.dx, command.dy);
    case 'sync-instance':
      return syncComponentInstance(doc, command.id, command.makeId);
    case 'swap-instance':
      return swapComponentInstance(doc, command.id, command.targetId, command.makeId);
    case 'create-variant-set':
      return createVariantSet(doc, command.ids, command.makeId, command.name, command.property);
    case 'switch-variant':
      return switchVariant(doc, command.id, command.targetId, command.makeId);
    case 'add-variant':
      return addVariant(doc, command.id, command.makeId, command.value);
    case 'create-variant-combo':
      return createVariantCombo(doc, command.setId, command.props, command.makeId, command.sourceId);
    case 'add-variant-property':
      return addVariantProperty(doc, command.setId, command.name, command.value);
    default: {
      const exhaustive: never = command;
      throw new Error(`未知命令：${JSON.stringify(exhaustive)}`);
    }
  }
}
