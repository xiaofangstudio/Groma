import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const SCENE_VERSION = 1;
export const FORMAT_VERSION = 1;

export function rootDir() {
  return path.resolve(process.env.GROMA_MCP_ROOT || path.join(os.homedir(), 'Documents', 'Groma'));
}

export function ensureRoot() {
  const root = rootDir();
  fs.mkdirSync(root, { recursive: true });
  return root;
}

export function safeId(id) {
  if (typeof id !== 'string' || !id.trim()) throw new Error('工程 id 不能为空');
  if (id.includes('..') || /[\\/:*?"<>|]/.test(id)) throw new Error('工程 id 含非法字符');
  return id;
}

export function projectDir(id) {
  const root = ensureRoot();
  const dir = path.resolve(root, `${safeId(id)}.groma`);
  if (!dir.startsWith(root + path.sep)) throw new Error('工程路径越界');
  return dir;
}

export function sanitizeName(name) {
  const cleaned = String(name || '')
    .replace(/[\\/:*?"<>|]/g, '')
    .trim()
    .slice(0, 40);
  return cleaned || '未命名设计';
}

export function nowMs() {
  return Date.now();
}

function atomicWrite(file, text) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  fs.renameSync(tmp, file);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function metaPath(dir) {
  return path.join(dir, 'project.json');
}

export function readMeta(id) {
  const dir = projectDir(id);
  const metaFile = metaPath(dir);
  if (!fs.existsSync(metaFile)) throw new Error(`工程 ${id} 缺少 project.json`);
  return readJson(metaFile);
}

function writeMeta(dir, meta) {
  atomicWrite(metaPath(dir), JSON.stringify(meta, null, 2));
}

export function createDefaultDoc(name) {
  const pageId = 'page-1';
  const rootId = 'root-1';
  const frameId = 'frame-1';
  return {
    version: SCENE_VERSION,
    name,
    pages: [{ id: pageId, name: '页面 1', rootId, background: '#E9E8E4' }],
    nodes: {
      [rootId]: {
        id: rootId,
        type: 'page',
        name: '页面 1',
        parentId: null,
        children: [frameId],
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
      },
      [frameId]: {
        id: frameId,
        type: 'frame',
        name: '桌面 1440',
        parentId: rootId,
        children: [],
        x: 0,
        y: 0,
        w: 1440,
        h: 900,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        clipContent: true,
        fills: [{ type: 'solid', color: '#FFFFFF', opacity: 1 }],
        cornerRadius: 0,
      },
    },
  };
  }

const NODE_TYPES = new Set(['page', 'frame', 'rect', 'ellipse', 'text', 'group']);
const RESERVED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function requireNumber(value, label, min = -Infinity, max = Infinity) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} 必须是 ${min}–${max} 范围内的有限数字`);
  }
}

export function validateScene(scene) {
  if (!scene || typeof scene !== 'object' || Array.isArray(scene)) throw new Error('场景必须是对象');
  if (scene.version !== SCENE_VERSION) throw new Error(`不支持的场景版本：${scene.version}`);
  if (typeof scene.name !== 'string') throw new Error('场景 name 必须是字符串');
  if (!Array.isArray(scene.pages) || !scene.pages.length) throw new Error('场景缺少页面');
  if (!scene.nodes || typeof scene.nodes !== 'object' || Array.isArray(scene.nodes)) throw new Error('场景缺少 nodes');

  const nodes = scene.nodes;
  const roots = new Set();
  const pageIds = new Set();
  for (const page of scene.pages) {
    if (!page || typeof page.id !== 'string' || !page.id || typeof page.rootId !== 'string' || !page.rootId) {
      throw new Error('页面缺少 id 或 rootId');
    }
    if (pageIds.has(page.id)) throw new Error(`页面 id 重复：${page.id}`);
    pageIds.add(page.id);
    const root = nodes[page.rootId];
    if (!root) throw new Error(`页面 ${page.id} 的根节点不存在`);
    if (root.type !== 'page') throw new Error(`页面 ${page.id} 的根节点必须是 page`);
    if (root.parentId !== null) throw new Error(`页面 ${page.id} 的根节点 parentId 必须为 null`);
    roots.add(page.rootId);
  }

  const nodeIds = Object.keys(nodes);
  for (const key of nodeIds) {
    if (RESERVED_KEYS.has(key)) throw new Error(`节点 id ${key} 是保留键`);
    const node = nodes[key];
    if (!node || typeof node !== 'object' || Array.isArray(node)) throw new Error(`节点 ${key} 不是对象`);
    if (node.id !== key) throw new Error(`节点 ${key} 的 id 与键名不一致`);
    if (!NODE_TYPES.has(node.type)) throw new Error(`节点 ${key} 的类型不受支持`);
    if (typeof node.name !== 'string') throw new Error(`节点 ${key} 缺少名称`);
    if (node.parentId !== null && typeof node.parentId !== 'string') throw new Error(`节点 ${key} 的 parentId 非法`);
    if (!Array.isArray(node.children) || !node.children.every((id) => typeof id === 'string')) {
      throw new Error(`节点 ${key} 的 children 非法`);
    }
    if (new Set(node.children).size !== node.children.length) throw new Error(`节点 ${key} 的 children 有重复 id`);
    requireNumber(node.x, `${key}.x`);
    requireNumber(node.y, `${key}.y`);
    requireNumber(node.w, `${key}.w`, 0);
    requireNumber(node.h, `${key}.h`, 0);
    requireNumber(node.rotation, `${key}.rotation`);
    requireNumber(node.opacity, `${key}.opacity`, 0, 1);
    requireNumber(node.cornerRadius, `${key}.cornerRadius`, 0);
    if (typeof node.visible !== 'boolean' || typeof node.locked !== 'boolean' || typeof node.clipContent !== 'boolean') {
      throw new Error(`节点 ${key} 的 visible/locked/clipContent 必须是布尔值`);
    }
    if (!Array.isArray(node.fills)) throw new Error(`节点 ${key} 的 fills 必须是数组`);
    for (const paint of node.fills) {
      if (!paint || paint.type !== 'solid' || typeof paint.color !== 'string' || typeof paint.opacity !== 'number') {
        throw new Error(`节点 ${key} 的填充不合法`);
      }
    }
    if (node.type === 'text') {
      if (typeof node.text !== 'string') throw new Error(`文本节点 ${key} 缺少 text`);
      requireNumber(node.fontSize, `${key}.fontSize`, 0);
      requireNumber(node.fontWeight, `${key}.fontWeight`, 0);
    }
  }

  const owners = new Map();
  for (const id of nodeIds) {
    const node = nodes[id];
    for (const childId of node.children) {
      const child = nodes[childId];
      if (!child) throw new Error(`节点 ${id} 引用了不存在的子节点 ${childId}`);
      if (child.parentId !== id) throw new Error(`节点 ${childId} 的 parentId 与父节点 ${id} 不一致`);
      if (owners.has(childId)) throw new Error(`节点 ${childId} 同时挂在多个父节点下`);
      owners.set(childId, id);
    }
    if (node.parentId !== null) {
      const parent = nodes[node.parentId];
      if (!parent) throw new Error(`节点 ${id} 的父节点不存在`);
      if (!parent.children.includes(id)) throw new Error(`节点 ${id} 与父节点 children 记录不一致`);
    }
  }

  const visited = new Set();
  const visiting = new Set();
  const walk = (id) => {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error(`节点树存在环：${id}`);
    const node = nodes[id];
    if (!node) return;
    visiting.add(id);
    for (const childId of node.children) walk(childId);
    visiting.delete(id);
    visited.add(id);
  };
  for (const rootId of roots) walk(rootId);
  if (visited.size !== nodeIds.length) {
    const orphan = nodeIds.find((id) => !visited.has(id));
    throw new Error(`节点 ${orphan} 不可从任何页面根节点到达`);
  }
  return scene;
}

export function listProjects() {
  const root = ensureRoot();
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.endsWith('.groma')) continue;
    const dir = path.join(root, entry.name);
    const id = entry.name.slice(0, -'.groma'.length);
    let meta = null;
    try {
      meta = readJson(metaPath(dir));
    } catch {
      meta = null;
    }
    const sceneFile = path.join(dir, 'scene.json');
    const bytes = fs.existsSync(sceneFile) ? fs.statSync(sceneFile).size : 0;
    out.push({
      id,
      name: meta?.name || id,
      updatedAt: meta?.updatedAt || 0,
      bytes,
    });
  }
  out.sort((a, b) => b.updatedAt - a.updatedAt);
  return out;
}

export function createProject({ name, dryRun = true, scene = null }) {
  const root = ensureRoot();
  const base = sanitizeName(name);
  let id = base;
  let n = 2;
  while (fs.existsSync(path.join(root, `${id}.groma`))) {
    id = `${base}-${n}`;
    n += 1;
  }
  const dir = path.join(root, `${id}.groma`);
  if (dryRun) return { id, dir, dryRun: true, created: false };

  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'snapshots'), { recursive: true });
  const now = nowMs();
  const meta = {
    format: 'groma',
    formatVersion: FORMAT_VERSION,
    name: base,
    createdAt: now,
    updatedAt: now,
  };
  writeMeta(dir, meta);
  const doc = scene ? validateScene(scene) : createDefaultDoc(base);
  atomicWrite(path.join(dir, 'scene.json'), JSON.stringify(doc, null, 2));
  return { id, dir, dryRun: false, created: true, scene: doc };
}

export function readScene(id) {
  const dir = projectDir(id);
  const sceneFile = path.join(dir, 'scene.json');
  if (!fs.existsSync(sceneFile)) throw new Error('工程还没有 scene.json');
  return validateScene(readJson(sceneFile));
}

function snapshot(dir) {
  const sceneFile = path.join(dir, 'scene.json');
  if (!fs.existsSync(sceneFile)) return;
  const snapDir = path.join(dir, 'snapshots');
  fs.mkdirSync(snapDir, { recursive: true });
  const target = path.join(snapDir, `${nowMs()}-${Math.random().toString(36).slice(2, 8)}.json`);
  fs.copyFileSync(sceneFile, target);
  const files = fs.readdirSync(snapDir).filter((f) => f.endsWith('.json')).sort();
  while (files.length > 20) {
    const old = files.shift();
    fs.rmSync(path.join(snapDir, old), { force: true });
  }
}

export function writeScene(id, scene, { snapshotBefore = true } = {}) {
  validateScene(scene);
  const dir = projectDir(id);
  if (!fs.existsSync(dir)) throw new Error('工程不存在');
  if (snapshotBefore) snapshot(dir);
  atomicWrite(path.join(dir, 'scene.json'), JSON.stringify(scene, null, 2));
  let meta;
  try {
    meta = readMeta(id);
  } catch {
    meta = {
      format: 'groma',
      formatVersion: FORMAT_VERSION,
      name: id,
      createdAt: nowMs(),
      updatedAt: nowMs(),
    };
  }
  meta.updatedAt = nowMs();
  writeMeta(dir, meta);
  return scene;
}

export function firstPage(scene) {
  return scene.pages[0];
}

export function rootOf(scene) {
  return scene.nodes[firstPage(scene).rootId];
}

export function findNode(scene, nodeId) {
  const node = scene.nodes[nodeId];
  if (!node) throw new Error(`节点不存在：${nodeId}`);
  return node;
}

export function nextId(scene, prefix) {
  let n = 1;
  while (scene.nodes[`${prefix}-${n}`]) n += 1;
  return `${prefix}-${n}`;
}

export function addFrame(scene, { name, x, y, w = 1440, h = 900, fill = '#FFFFFF' } = {}) {
  const root = rootOf(scene);
  const frames = root.children.map((id) => scene.nodes[id]).filter(Boolean);
  const maxRight = frames.length ? Math.max(...frames.map((f) => f.x + f.w)) : 0;
  const frameId = nextId(scene, 'frame');
  const frame = {
    id: frameId,
    type: 'frame',
    name: name || `画板 ${frames.length + 1}`,
    parentId: root.id,
    children: [],
    x: x ?? (frames.length ? maxRight + 80 : 0),
    y: y ?? 0,
    w,
    h,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    clipContent: true,
    fills: [{ type: 'solid', color: fill, opacity: 1 }],
    cornerRadius: 0,
  };
  root.children.push(frameId);
  scene.nodes[frameId] = frame;
  return frame;
}

export function updateNode(scene, nodeId, patch) {
  const node = findNode(scene, nodeId);
  const allowed = ['name', 'x', 'y', 'w', 'h', 'cornerRadius', 'opacity', 'visible', 'locked'];
  const next = { ...node };
  for (const key of allowed) {
    if (patch[key] !== undefined) next[key] = patch[key];
  }
  if (typeof next.name !== 'string' || !next.name) throw new Error('节点名称不能为空');
  for (const key of ['x', 'y', 'w', 'h', 'cornerRadius', 'opacity']) {
    if (typeof next[key] !== 'number' || !Number.isFinite(next[key])) throw new Error(`${key} 必须是有限数字`);
  }
  if (next.w !== undefined) next.w = Math.max(1, next.w);
  if (next.h !== undefined) next.h = Math.max(1, next.h);
  if (next.cornerRadius !== undefined) next.cornerRadius = Math.max(0, next.cornerRadius);
  if (next.opacity !== undefined) next.opacity = Math.min(1, Math.max(0, next.opacity));
  if (typeof next.visible !== 'boolean' || typeof next.locked !== 'boolean') throw new Error('visible/locked 必须是布尔值');
  if (patch.fillColor !== undefined) {
    next.fills = [{ type: 'solid', color: String(patch.fillColor).toUpperCase(), opacity: 1 }];
  }
  scene.nodes[nodeId] = next;
  return next;
}

export function duplicateFrame(scene, nodeId) {
  const source = findNode(scene, nodeId);
  if (source.type !== 'frame') throw new Error('只能复制画板节点');
  if (source.parentId === null) throw new Error('页面根节点不能复制');
  const parent = scene.nodes[source.parentId];
  if (!parent) throw new Error('源画板的父节点不存在');
  const sourceIndex = parent.children.indexOf(nodeId);
  if (sourceIndex < 0) throw new Error('源画板不在父节点 children 中');

  const used = new Set();
  const nextFreeId = (type) => {
    let n = 1;
    while (scene.nodes[`${type}-${n}`] || used.has(`${type}-${n}`)) n += 1;
    const id = `${type}-${n}`;
    used.add(id);
    return id;
  };

  const order = [];
  const stack = [nodeId];
  while (stack.length) {
    const id = stack.pop();
    const node = scene.nodes[id];
    if (!node) continue;
    order.push(id);
    for (const childId of node.children) stack.push(childId);
  }

  const idMap = new Map();
  for (const oldId of order) idMap.set(oldId, nextFreeId(scene.nodes[oldId].type));
  const clones = {};
  for (const oldId of order) {
    const oldNode = scene.nodes[oldId];
    clones[idMap.get(oldId)] = {
      ...oldNode,
      id: idMap.get(oldId),
      name: oldId === nodeId ? `${oldNode.name} 副本`.slice(0, 80) : oldNode.name,
      parentId: oldId === nodeId ? source.parentId : idMap.get(oldNode.parentId),
      children: oldNode.children.map((childId) => idMap.get(childId)).filter(Boolean),
    };
  }

  const rootClone = clones[idMap.get(nodeId)];
  rootClone.x = source.x + source.w + 40;
  rootClone.y = source.y;
  parent.children.splice(sourceIndex + 1, 0, rootClone.id);
  Object.assign(scene.nodes, clones);
  return rootClone;
}

export function deleteNode(scene, nodeId) {
  const node = findNode(scene, nodeId);
  if (node.type === 'page') throw new Error('不能删除页面根节点');
  if (node.parentId === null) throw new Error('不能删除没有父节点的节点');
  const parent = scene.nodes[node.parentId];
  if (!parent) throw new Error('节点的父节点不存在');
  const index = parent.children.indexOf(nodeId);
  if (index < 0) throw new Error('节点不在父节点 children 中');
  parent.children.splice(index, 1);

  const stack = [nodeId];
  while (stack.length) {
    const id = stack.pop();
    const current = scene.nodes[id];
    if (!current) continue;
    for (const child of current.children) stack.push(child);
    delete scene.nodes[id];
  }
  return { deleted: nodeId };
}

export function summaryOf(id) {
  const scene = readScene(id);
  const root = rootOf(scene);
  const frames = root.children.map((cid) => scene.nodes[cid]).filter(Boolean);
  let bounds = null;
  if (frames.length) {
    const minX = Math.min(...frames.map((f) => f.x));
    const minY = Math.min(...frames.map((f) => f.y));
    const maxX = Math.max(...frames.map((f) => f.x + f.w));
    const maxY = Math.max(...frames.map((f) => f.y + f.h));
    bounds = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  let meta = {};
  try {
    meta = readMeta(id);
  } catch {
    meta = {};
  }
  return {
    id,
    name: meta.name || scene.name,
    updatedAt: meta.updatedAt || 0,
    pages: scene.pages.length,
    frames: frames.length,
    nodes: Object.keys(scene.nodes).length,
    bounds,
    frameList: frames.map((f) => ({ id: f.id, name: f.name, x: f.x, y: f.y, w: f.w, h: f.h })),
  };
}
