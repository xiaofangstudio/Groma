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

const NODE_TYPES = new Set(['page', 'frame', 'section', 'rect', 'ellipse', 'text', 'group', 'slice']);
const RESERVED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function requireNumber(value, label, min = -Infinity, max = Infinity) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} 必须是 ${min}–${max} 范围内的有限数字`);
  }
}

/** 与前端 Paint 一致：最多 16 层，纯色 / 线性 / 径向，visible 缺省为显示。 */
export function normalizeFills(value) {
  if (!Array.isArray(value)) throw new Error('fills 必须是数组');
  if (value.length > 16) throw new Error('一个节点最多 16 层填充');
  return value.map((paint, index) => {
    if (!paint || typeof paint !== 'object' || Array.isArray(paint)) throw new Error(`第 ${index + 1} 层填充不是对象`);
    if (typeof paint.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(paint.color)) {
      throw new Error(`fills[${index}].color 必须是 #RRGGBB`);
    }
    requireNumber(paint.opacity, `fills[${index}].opacity`, 0, 1);
    if (paint.visible !== undefined && typeof paint.visible !== 'boolean') throw new Error(`fills[${index}].visible 必须是布尔值`);
    const base = { color: paint.color.toUpperCase(), opacity: paint.opacity, ...(paint.visible !== undefined ? { visible: paint.visible } : {}) };
    if (paint.type === 'solid') return { type: 'solid', ...base };
    if (paint.type !== 'linear' && paint.type !== 'radial') throw new Error(`fills[${index}].type 不受支持`);
    if (!Array.isArray(paint.stops) || paint.stops.length < 1 || paint.stops.length > 32) {
      throw new Error(`fills[${index}].stops 必须是 1–32 个色标`);
    }
    const stops = paint.stops.map((stop, stopIndex) => {
      if (!stop || typeof stop !== 'object' || Array.isArray(stop)) throw new Error(`fills[${index}].stops[${stopIndex}] 非法`);
      requireNumber(stop.offset, `fills[${index}].stops[${stopIndex}].offset`, 0, 1);
      requireNumber(stop.opacity, `fills[${index}].stops[${stopIndex}].opacity`, 0, 1);
      if (typeof stop.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(stop.color)) {
        throw new Error(`fills[${index}].stops[${stopIndex}].color 必须是 #RRGGBB`);
      }
      return { offset: stop.offset, color: stop.color.toUpperCase(), opacity: stop.opacity };
    });
    if (paint.type === 'linear') {
      for (const key of ['x1', 'y1', 'x2', 'y2']) requireNumber(paint[key], `fills[${index}].${key}`);
      return { type: 'linear', ...base, x1: paint.x1, y1: paint.y1, x2: paint.x2, y2: paint.y2, stops };
    }
    for (const key of ['cx', 'cy', 'r']) requireNumber(paint[key], `fills[${index}].${key}`);
    return { type: 'radial', ...base, cx: paint.cx, cy: paint.cy, r: paint.r, stops };
  });
}

/** 与前端 Effect 一致：投影与整层模糊，最多 12 条。 */
export function normalizeEffects(value) {
  if (!Array.isArray(value)) throw new Error('effects 必须是数组');
  if (value.length > 12) throw new Error('一个节点最多 12 条效果');
  return value.map((effect, index) => {
    if (!effect || typeof effect !== 'object' || Array.isArray(effect)) throw new Error(`第 ${index + 1} 条效果不是对象`);
    if (effect.type === 'drop-shadow') {
      requireNumber(effect.x, `effects[${index}].x`);
      requireNumber(effect.y, `effects[${index}].y`);
      requireNumber(effect.blur, `effects[${index}].blur`, 0, 1000);
      requireNumber(effect.opacity, `effects[${index}].opacity`, 0, 1);
      if (typeof effect.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(effect.color)) {
        throw new Error(`effects[${index}].color 必须是 #RRGGBB`);
      }
      if (typeof effect.visible !== 'boolean') throw new Error(`effects[${index}].visible 必须是布尔值`);
      return { type: 'drop-shadow', x: effect.x, y: effect.y, blur: effect.blur, color: effect.color.toUpperCase(), opacity: effect.opacity, visible: effect.visible };
    }
    if (effect.type === 'layer-blur') {
      requireNumber(effect.blur, `effects[${index}].blur`, 0, 1000);
      if (typeof effect.visible !== 'boolean') throw new Error(`effects[${index}].visible 必须是布尔值`);
      return { type: 'layer-blur', blur: effect.blur, visible: effect.visible };
    }
    throw new Error(`effects[${index}].type 不受支持`);
  });
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
    normalizeFills(node.fills);
    if (node.type === 'text') {
      if (typeof node.text !== 'string') throw new Error(`文本节点 ${key} 缺少 text`);
      requireNumber(node.fontSize, `${key}.fontSize`, 0);
      requireNumber(node.fontWeight, `${key}.fontWeight`, 0);
      if (node.letterSpacing !== undefined) requireNumber(node.letterSpacing, `${key}.letterSpacing`);
      if (node.paragraphSpacing !== undefined) requireNumber(node.paragraphSpacing, `${key}.paragraphSpacing`, 0);
      if (node.listStyle !== undefined && !['none', 'bullet', 'number'].includes(node.listStyle)) {
        throw new Error(`${key}.listStyle 不受支持`);
      }
    }
    if (node.effects !== undefined) normalizeEffects(node.effects);
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

export function addFrameGrid(scene, {
  rows = 10,
  cols = 10,
  w = 1440,
  h = 900,
  gapX = 80,
  gapY = 80,
  x = 0,
  y = 0,
  namePrefix = '画板',
  fill = '#FFFFFF',
} = {}) {
  const r = Math.round(Number(rows));
  const c = Math.round(Number(cols));
  if (!Number.isInteger(r) || r < 1 || r > 100) throw new Error('rows 必须是 1–100 的整数');
  if (!Number.isInteger(c) || c < 1 || c > 50) throw new Error('cols 必须是 1–50 的整数');
  const total = r * c;
  if (total > 500) throw new Error('一次最多建 500 块画板');
  requireNumber(w, 'w', 1);
  requireNumber(h, 'h', 1);
  requireNumber(gapX, 'gapX', 0);
  requireNumber(gapY, 'gapY', 0);
  requireNumber(x, 'x');
  requireNumber(y, 'y');
  if (typeof fill !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(fill)) throw new Error('fill 必须是 #RRGGBB');
  const root = rootOf(scene);
  const existing = root.children.map((id) => scene.nodes[id]).filter((n) => n?.type === 'frame').length;
  const prefix = String(namePrefix || '画板').trim().slice(0, 24) || '画板';
  const ids = [];
  for (let row = 0; row < r; row += 1) {
    for (let col = 0; col < c; col += 1) {
      let n = 1;
      while (scene.nodes[`frame-${n}`]) n += 1;
      const id = `frame-${n}`;
      const frame = {
        id,
        type: 'frame',
        name: `${prefix} ${row + 1}-${col + 1}`,
        parentId: root.id,
        children: [],
        x: x + col * (w + gapX),
        y: y + row * (h + gapY),
        w,
        h,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        clipContent: true,
        fills: [{ type: 'solid', color: fill.toUpperCase(), opacity: 1 }],
        cornerRadius: 0,
      };
      scene.nodes[id] = frame;
      ids.push(id);
    }
  }
  root.children.push(...ids);
  return {
    count: ids.length,
    rows: r,
    cols: c,
    existing,
    ids,
    bounds: {
      x,
      y,
      w: c * w + Math.max(0, c - 1) * gapX,
      h: r * h + Math.max(0, r - 1) * gapY,
    },
  };
}

export function updatePageConfig(scene, { pageId = null, name = null, background = null } = {}) {
  const page = pageId ? scene.pages.find((p) => p.id === pageId) : scene.pages[0];
  if (!page) throw new Error(`页面不存在：${pageId}`);
  if (name !== null && name !== undefined) {
    const nextName = String(name).trim().slice(0, 40);
    if (!nextName) throw new Error('页面名称不能为空');
    page.name = nextName;
    const root = scene.nodes[page.rootId];
    if (root) root.name = nextName;
  }
  if (background !== null && background !== undefined) {
    if (typeof background !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(background)) {
      throw new Error('background 必须是 #RRGGBB');
    }
    page.background = background.toUpperCase();
  }
  return { pageId: page.id, name: page.name, background: page.background, rootId: page.rootId };
}

export function addNode(scene, {
  parentId,
  type,
  name,
  x = 0,
  y = 0,
  w = 320,
  h = 200,
  fill = null,
  cornerRadius = 0,
  text = '文本',
  fontSize = 24,
  fontWeight = 600,
  letterSpacing = 0,
  lineHeight = 1.2,
  paragraphSpacing = 0,
  listStyle = 'none',
} = {}) {
  const allowed = new Set(['frame', 'section', 'rect', 'ellipse', 'text', 'slice']);
  if (!allowed.has(type)) throw new Error(`MCP 只能新增 ${[...allowed].join(' / ')}`);
  const parent = findNode(scene, parentId);
  if (parent.type === 'slice' || parent.type === 'text' || parent.type === 'rect' || parent.type === 'ellipse') {
    throw new Error('文本、矩形、椭圆与切片不能作为父节点');
  }
  const id = nextId(scene, type);
  const label = type === 'frame' ? '画板' : type === 'section' ? '区块' : type === 'rect' ? '矩形' : type === 'ellipse' ? '椭圆' : type === 'slice' ? '切片' : '文本';
  const node = {
    id,
    type,
    name: name || `${label} ${id.split('-').pop()}`,
    parentId: parent.id,
    children: [],
    x,
    y,
    w: Math.max(1, w),
    h: Math.max(1, h),
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    clipContent: type === 'frame',
    fills: type === 'section' || type === 'slice' ? [] : [{ type: 'solid', color: String(fill ?? (type === 'text' ? '#221C00' : '#D9D9D9')).toUpperCase(), opacity: 1 }],
    cornerRadius: Math.max(0, cornerRadius),
  };
  if (type === 'text') {
    node.text = text;
    node.fontSize = Math.max(1, fontSize);
    node.fontWeight = Math.max(1, fontWeight);
    node.letterSpacing = letterSpacing;
    node.lineHeight = Math.max(0.1, lineHeight);
    node.paragraphSpacing = Math.max(0, paragraphSpacing);
    node.listStyle = listStyle;
  }
  parent.children.push(id);
  scene.nodes[id] = node;
  return node;
}

export function addPage(scene, { name, background = '#E9E8E4', frameName = null, w = 1440, h = 900 } = {}) {
  const existing = scene.pages.length;
  let n = existing + 1;
  while (scene.pages.some((p) => p.id === `page-${n}`)) n += 1;
  const pageId = `page-${n}`;
  const rootId = nextId(scene, 'root');
  const page = { id: pageId, name: name || `页面 ${existing + 1}`, rootId, background };
  const root = {
    id: rootId,
    type: 'page',
    name: page.name,
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
  scene.nodes[rootId] = root;
  scene.pages.push(page);
  let frame = null;
  if (frameName) {
    frame = addNode(scene, {
      parentId: rootId,
      type: 'frame',
      name: frameName,
      x: 0,
      y: 0,
      w,
      h,
      fill: '#FFFFFF',
    });
  }
  return { page, root, frame };
}

export function listNodes(scene, { rootId = null, type = null, query = '', limit = 200 } = {}) {
  const start = rootId || scene.pages[0].rootId;
  if (!scene.nodes[start]) throw new Error(`起始节点不存在：${start}`);
  const max = Math.min(1000, Math.max(1, Number(limit) || 200));
  const needle = String(query || '').trim().toLowerCase();
  const out = [];
  const stack = [{ id: start, depth: 0 }];
  while (stack.length && out.length < max) {
    const item = stack.pop();
    const node = scene.nodes[item.id];
    if (!node) continue;
    const matchType = !type || node.type === type;
    const matchQuery = !needle || node.name.toLowerCase().includes(needle) || (node.text || '').toLowerCase().includes(needle);
    if (item.depth > 0 && matchType && matchQuery) {
      out.push({
        id: node.id,
        type: node.type,
        name: node.name,
        parentId: node.parentId,
        depth: item.depth,
        x: node.x,
        y: node.y,
        w: node.w,
        h: node.h,
        visible: node.visible,
        locked: node.locked,
        children: node.children.length,
        ...(node.type === 'text' ? { text: node.text, fontSize: node.fontSize, fontWeight: node.fontWeight } : {}),
        ...(node.effects?.length ? { effects: node.effects.length } : {}),
      });
    }
    for (let i = node.children.length - 1; i >= 0; i -= 1) stack.push({ id: node.children[i], depth: item.depth + 1 });
  }
  return { total: Object.keys(scene.nodes).length, returned: out.length, truncated: out.length >= max, nodes: out };
}

export function reorderNode(scene, nodeId, index) {
  const node = findNode(scene, nodeId);
  if (node.parentId === null) throw new Error('页面根节点不能重排');
  const parent = scene.nodes[node.parentId];
  const current = parent.children.indexOf(nodeId);
  if (current < 0) throw new Error('节点不在父节点 children 中');
  parent.children.splice(current, 1);
  let target;
  if (index === 'front') target = parent.children.length;
  else if (index === 'back') target = 0;
  else {
    requireNumber(index, 'index', 0, parent.children.length);
    target = Math.round(index);
  }
  parent.children.splice(target, 0, nodeId);
  return { nodeId, parentId: parent.id, index: target, siblings: parent.children.length };
}


export function updateNode(scene, nodeId, patch) {
  const node = findNode(scene, nodeId);
  const allowed = [
    'name', 'x', 'y', 'w', 'h', 'rotation', 'cornerRadius', 'cornerRadii', 'opacity', 'visible', 'locked', 'clipContent',
    'fills', 'constraints', 'layout', 'prototype',
    'text', 'fontSize', 'fontWeight', 'letterSpacing', 'lineHeight', 'paragraphSpacing', 'listStyle',
  ];
  const next = { ...node };
  for (const key of allowed) {
    if (patch[key] !== undefined) next[key] = patch[key];
  }
  if (typeof next.name !== 'string' || !next.name) throw new Error('节点名称不能为空');
  for (const key of ['x', 'y', 'w', 'h', 'rotation', 'cornerRadius', 'opacity']) {
    if (typeof next[key] !== 'number' || !Number.isFinite(next[key])) throw new Error(`${key} 必须是有限数字`);
  }
  if (next.w !== undefined) next.w = Math.max(1, next.w);
  if (next.h !== undefined) next.h = Math.max(1, next.h);
  if (next.cornerRadius !== undefined) next.cornerRadius = Math.max(0, next.cornerRadius);
  if (next.cornerRadii !== undefined) {
    if (!Array.isArray(next.cornerRadii) || next.cornerRadii.length !== 4 || !next.cornerRadii.every((value) => Number.isFinite(value) && value >= 0)) {
      throw new Error('cornerRadii 必须是四个非负有限数字');
    }
  }
  if (next.opacity !== undefined) next.opacity = Math.min(1, Math.max(0, next.opacity));
  if (typeof next.visible !== 'boolean' || typeof next.locked !== 'boolean') throw new Error('visible/locked 必须是布尔值');
  if (typeof next.clipContent !== 'boolean') throw new Error('clipContent 必须是布尔值');
  if (patch.fillColor !== undefined) {
    next.fills = [{ type: 'solid', color: String(patch.fillColor).toUpperCase(), opacity: 1 }];
  }
  if (patch.fills !== undefined) {
    next.fills = normalizeFills(patch.fills);
  }
  if (patch.constraints !== undefined) {
    const horizontal = ['left', 'right', 'center', 'leftRight', 'scale'];
    const vertical = ['top', 'bottom', 'center', 'topBottom', 'scale'];
    if (
      !patch.constraints ||
      typeof patch.constraints !== 'object' ||
      !horizontal.includes(patch.constraints.horizontal) ||
      !vertical.includes(patch.constraints.vertical)
    ) {
      throw new Error('constraints 必须是合法的水平 / 垂直约束');
    }
    next.constraints = { horizontal: patch.constraints.horizontal, vertical: patch.constraints.vertical };
  }
  if (patch.effects !== undefined) {
    next.effects = normalizeEffects(patch.effects);
    if (!next.effects.length) delete next.effects;
  }
  if (patch.prototype !== undefined) {
    if (patch.prototype === null) {
      delete next.prototype;
    } else {
      const targetId = patch.prototype?.targetId;
      const target = typeof targetId === 'string' ? scene.nodes[targetId] : null;
      if (!target || target.type !== 'frame') throw new Error('prototype.targetId 必须指向当前工程里存在的画板');
      if (patch.prototype.trigger !== undefined && patch.prototype.trigger !== 'click') {
        throw new Error('prototype.trigger 目前只支持 click');
      }
      next.prototype = { targetId, trigger: 'click' };
    }
  }
  if (next.type === 'text') {
    if (typeof next.text !== 'string') throw new Error('text 必须是字符串');
    requireNumber(next.fontSize, 'fontSize', 1);
    requireNumber(next.fontWeight, 'fontWeight', 1);
    if (next.letterSpacing !== undefined) requireNumber(next.letterSpacing, 'letterSpacing');
    if (next.lineHeight !== undefined) requireNumber(next.lineHeight, 'lineHeight', 0.1);
    if (next.paragraphSpacing !== undefined) requireNumber(next.paragraphSpacing, 'paragraphSpacing', 0);
    if (next.listStyle !== undefined && !['none', 'bullet', 'number'].includes(next.listStyle)) {
      throw new Error('listStyle 必须是 none / bullet / number');
    }
  }
  scene.nodes[nodeId] = next;
  return next;
}

export function updateNodes(scene, changes) {
  if (!Array.isArray(changes) || changes.length === 0) throw new Error('changes 必须是非空数组');
  if (changes.length > 200) throw new Error('一次最多改 200 个节点');
  const seen = new Set();
  for (const change of changes) {
    if (!change || typeof change.nodeId !== 'string') throw new Error('每项必须带 nodeId');
    if (seen.has(change.nodeId)) throw new Error(`同一批里重复节点：${change.nodeId}`);
    seen.add(change.nodeId);
    findNode(scene, change.nodeId);
  }
  // 先从所有 id 校验完（上面的 findNode），再开始改，避免批量中途才失败。
  const updated = [];
  for (const change of changes) {
    updated.push(updateNode(scene, change.nodeId, change.patch ?? {}));
  }
  return updated;
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
