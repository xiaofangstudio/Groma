import type { GromaDoc, Guide, ImageAsset, NodeType, Page, Paint, SceneNode } from './types';

const NODE_TYPES: NodeType[] = ['page', 'frame', 'section', 'rect', 'ellipse', 'text', 'path', 'image', 'group', 'slice'];
const NODE_TYPE_SET = new Set<string>(NODE_TYPES);
const RESERVED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export type DocValidation =
  | { ok: true; doc: GromaDoc }
  | { ok: false; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.length > 0);
}

function validateStop(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isFiniteNumber(value.offset) &&
    value.offset >= 0 &&
    value.offset <= 1 &&
    typeof value.color === 'string' &&
    isFiniteNumber(value.opacity) &&
    value.opacity >= 0 &&
    value.opacity <= 1
  );
}

function validatePaint(value: unknown): value is Paint {
  if (!isRecord(value)) return false;
  if (typeof value.color !== 'string' || !isFiniteNumber(value.opacity)) return false;
  if (value.type === 'solid') return true;
  if (!Array.isArray(value.stops) || !value.stops.every(validateStop)) return false;
  if (value.type === 'linear') {
    return ['x1', 'y1', 'x2', 'y2'].every((field) => isFiniteNumber(value[field]));
  }
  if (value.type === 'radial') {
    return ['cx', 'cy', 'r'].every((field) => isFiniteNumber(value[field])) && Number(value.r) >= 0;
  }
  return false;
}

function validateStroke(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.color !== 'string' || !isFiniteNumber(value.opacity)) return false;
  if (!isFiniteNumber(value.width) || value.width < 0) return false;
  if (!Array.isArray(value.dash) || !value.dash.every((item) => isFiniteNumber(item) && item >= 0)) {
    return false;
  }
  if (value.cap !== undefined && !['butt', 'round', 'square'].includes(String(value.cap))) return false;
  if (value.join !== undefined && !['miter', 'round', 'bevel'].includes(String(value.join))) return false;
  return true;
}

function validatePathAnchor(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const vertexOk =
    value.vertexId === undefined ||
    (typeof value.vertexId === 'string' && value.vertexId.trim().length > 0);
  return vertexOk && ['x', 'y', 'inX', 'inY', 'outX', 'outY'].every((field) => isFiniteNumber(value[field]));
}

function validatePathContour(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    Array.isArray(value.anchors) &&
    value.anchors.length >= 2 &&
    value.anchors.every(validatePathAnchor) &&
    typeof value.closed === 'boolean'
  );
}

function validateGuide(value: unknown): value is Guide {
  if (!isRecord(value)) return false;
  return (value.axis === 'x' || value.axis === 'y') && isFiniteNumber(value.position);
}

function validateAsset(value: unknown): value is ImageAsset {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string' || value.id.length === 0) return false;
  if (typeof value.name !== 'string' || value.name.length === 0) return false;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(String(value.mime))) return false;
  if (typeof value.file !== 'string' || !value.file.startsWith('assets/')) return false;
  if (value.file.includes('..') || value.file.includes('\\')) return false;
  if (!isFiniteNumber(value.w) || value.w <= 0 || !isFiniteNumber(value.h) || value.h <= 0) return false;
  if (!isFiniteNumber(value.bytes) || value.bytes < 0) return false;
  return true;
}

function validatePage(value: unknown): value is Page {
  if (!isRecord(value)) return false;
  const guidesOk =
    value.guides === undefined ||
    (Array.isArray(value.guides) && value.guides.every(validateGuide));
  return (
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.name === 'string' &&
    typeof value.rootId === 'string' &&
    value.rootId.length > 0 &&
    typeof value.background === 'string' &&
    guidesOk
  );
}

function validateNode(node: SceneNode, key: string, assets: Record<string, ImageAsset>, issues: string[]): void {
  if (!isRecord(node)) {
    issues.push(`节点 ${key} 不是对象`);
    return;
  }
  if (node.id !== key) issues.push(`节点 ${key} 的 id 与键名不一致`);
  if (!NODE_TYPE_SET.has(node.type)) issues.push(`节点 ${key} 的类型 ${String(node.type)} 不受支持`);
  if (typeof node.name !== 'string') issues.push(`节点 ${key} 缺少合法名称`);
  if (node.parentId !== null && typeof node.parentId !== 'string') {
    issues.push(`节点 ${key} 的 parentId 必须是字符串或 null`);
  }
  if (!isStringArray(node.children)) {
    issues.push(`节点 ${key} 的 children 必须是字符串数组`);
  } else {
    if (new Set(node.children).size !== node.children.length) issues.push(`节点 ${key} 的 children 有重复 id`);
    if (node.children.includes(key)) issues.push(`节点 ${key} 不能把自己列为子节点`);
  }
  for (const field of ['x', 'y', 'w', 'h', 'rotation', 'opacity', 'cornerRadius'] as const) {
    if (!isFiniteNumber(node[field])) issues.push(`节点 ${key} 的 ${field} 不是有限数字`);
  }
  if (isFiniteNumber(node.w) && node.w < 0) issues.push(`节点 ${key} 的宽度不能为负`);
  if (isFiniteNumber(node.h) && node.h < 0) issues.push(`节点 ${key} 的高度不能为负`);
  if (isFiniteNumber(node.opacity) && (node.opacity < 0 || node.opacity > 1)) {
    issues.push(`节点 ${key} 的透明度必须在 0–1`);
  }
  if (!Array.isArray(node.fills) || !node.fills.every(validatePaint)) {
    issues.push(`节点 ${key} 的 fills 必须是合法的填充数组`);
  }
  if (node.strokes !== undefined && (!Array.isArray(node.strokes) || !node.strokes.every(validateStroke))) {
    issues.push(`节点 ${key} 的 strokes 必须是合法的描边数组`);
  }
  for (const field of ['visible', 'locked', 'clipContent'] as const) {
    if (typeof node[field] !== 'boolean') issues.push(`节点 ${key} 的 ${field} 必须是布尔值`);
  }
  if (node.isMask !== undefined && typeof node.isMask !== 'boolean') {
    issues.push(`节点 ${key} 的 isMask 必须是布尔值`);
  }
  if (
    node.maskType !== undefined &&
    (node.maskType !== 'geometry' && node.maskType !== 'alpha' && node.maskType !== 'luminance')
  ) {
    issues.push(`节点 ${key} 的 maskType 非法`);
  }
  if (node.type === 'path') {
    if (typeof node.pathData !== 'string' || node.pathData.trim().length === 0) {
      issues.push(`路径节点 ${key} 缺少 pathData`);
    }
    if (node.pathW !== undefined && (!isFiniteNumber(node.pathW) || node.pathW <= 0)) {
      issues.push(`路径节点 ${key} 的 pathW 非法`);
    }
    if (node.pathH !== undefined && (!isFiniteNumber(node.pathH) || node.pathH <= 0)) {
      issues.push(`路径节点 ${key} 的 pathH 非法`);
    }
    if (node.pathAnchors !== undefined) {
      if (!Array.isArray(node.pathAnchors) || node.pathAnchors.length < 2 || !node.pathAnchors.every(validatePathAnchor)) {
        issues.push(`路径节点 ${key} 的 pathAnchors 必须是至少两个合法锚点`);
      }
    }
    if (node.pathClosed !== undefined && typeof node.pathClosed !== 'boolean') {
      issues.push(`路径节点 ${key} 的 pathClosed 必须是布尔值`);
    }
    if (node.pathContours !== undefined) {
      if (!Array.isArray(node.pathContours) || node.pathContours.length === 0 || !node.pathContours.every(validatePathContour)) {
        issues.push(`路径节点 ${key} 的 pathContours 必须是非空、每条至少两个合法锚点的轮廓`);
      }
    }
    if (node.fillRule !== undefined && node.fillRule !== 'nonzero' && node.fillRule !== 'evenodd') {
      issues.push(`路径节点 ${key} 的 fillRule 非法`);
    }
    if (node.shapeKind !== undefined && node.shapeKind !== 'polygon' && node.shapeKind !== 'star' && node.shapeKind !== 'arrow') {
      issues.push(`路径节点 ${key} 的 shapeKind 非法`);
    }
    if (node.arrowHeadData !== undefined && (typeof node.arrowHeadData !== 'string' || node.arrowHeadData.length === 0)) {
      issues.push(`路径节点 ${key} 的 arrowHeadData 非法`);
    }
    if (node.shapeSides !== undefined && (!isFiniteNumber(node.shapeSides) || node.shapeSides < 3 || node.shapeSides > 12)) {
      issues.push(`路径节点 ${key} 的 shapeSides 必须在 3–12`);
    }
    if (node.shapeInnerRatio !== undefined && (!isFiniteNumber(node.shapeInnerRatio) || node.shapeInnerRatio < 0.1 || node.shapeInnerRatio > 0.9)) {
      issues.push(`路径节点 ${key} 的 shapeInnerRatio 必须在 0.1–0.9`);
    }
  }
  if (node.type === 'text') {
    if (typeof node.text !== 'string') issues.push(`文本节点 ${key} 缺少 text`);
    if (!isFiniteNumber(node.fontSize) || node.fontSize <= 0) issues.push(`文本节点 ${key} 的 fontSize 非法`);
    if (!isFiniteNumber(node.fontWeight)) issues.push(`文本节点 ${key} 的 fontWeight 非法`);
    if (node.letterSpacing !== undefined && (!isFiniteNumber(node.letterSpacing) || Math.abs(node.letterSpacing) > 200)) {
      issues.push(`文本节点 ${key} 的 letterSpacing 非法`);
    }
    if (node.paragraphSpacing !== undefined && (!isFiniteNumber(node.paragraphSpacing) || node.paragraphSpacing < 0 || node.paragraphSpacing > 200)) {
      issues.push(`文本节点 ${key} 的 paragraphSpacing 非法`);
    }
    if (node.listStyle !== undefined && node.listStyle !== 'none' && node.listStyle !== 'bullet' && node.listStyle !== 'number') {
      issues.push(`文本节点 ${key} 的 listStyle 非法`);
    }
  }
  if (node.imageFill !== undefined) {
    const fill = node.imageFill;
    if (node.type !== 'rect' && node.type !== 'ellipse' && node.type !== 'path') {
      issues.push(`节点 ${key} 的 imageFill 只允许形状节点`);
    } else if (
      !isRecord(fill) ||
      typeof fill.assetId !== 'string' ||
      !assets[fill.assetId] ||
      (fill.mode !== 'fill' && fill.mode !== 'fit') ||
      !isFiniteNumber(fill.focusX) ||
      !isFiniteNumber(fill.focusY) ||
      fill.focusX < 0 ||
      fill.focusX > 1 ||
      fill.focusY < 0 ||
      fill.focusY > 1 ||
      !isFiniteNumber(fill.opacity) ||
      fill.opacity < 0 ||
      fill.opacity > 1
    ) {
      issues.push(`节点 ${key} 的 imageFill 非法`);
    }
  }
  if (node.type === 'image') {
    if (typeof node.assetId !== 'string' || node.assetId.length === 0) {
      issues.push(`图片节点 ${key} 缺少 assetId`);
    } else if (!assets[node.assetId]) {
      issues.push(`图片节点 ${key} 引用了不存在的资产 ${node.assetId}`);
    }
    if (node.imageCrop !== undefined) {
      const crop = node.imageCrop;
      if (
        !isRecord(crop) ||
        ![crop.x, crop.y, crop.w, crop.h].every(isFiniteNumber) ||
        crop.x < 0 ||
        crop.y < 0 ||
        crop.w <= 0 ||
        crop.h <= 0 ||
        crop.x + crop.w > 1.0001 ||
        crop.y + crop.h > 1.0001
      ) {
        issues.push(`图片节点 ${key} 的 imageCrop 非法`);
      }
    }
  }
}

function limitIssues(issues: string[]): string[] {
  return issues.length > 40 ? [...issues.slice(0, 40), `……还有 ${issues.length - 40} 个问题`] : issues;
}

/**
 * 结构级校验。宁可拒绝一个损坏工程，也不要把坏节点放进渲染器后崩在用户手里。
 * 校验范围：节点键/id 一致、类型合法、数值有限、父子互指、无重复归属、无环、无孤儿。
 */
export function validateDoc(value: unknown): DocValidation {
  const issues: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ['场景根不是对象'] };
  if (value.version !== 1) return { ok: false, errors: [`不支持的场景版本 ${String(value.version)}`] };
  if (typeof value.name !== 'string') issues.push('场景 name 必须是字符串');
  if (!Array.isArray(value.pages) || value.pages.length === 0) issues.push('场景必须至少有一页');
  if (!isRecord(value.nodes)) issues.push('场景 nodes 必须是对象');

  if (!Array.isArray(value.pages) || !isRecord(value.nodes)) return { ok: false, errors: limitIssues(issues) };

  const pages: Page[] = [];
  const pageIds = new Set<string>();
  for (const [index, raw] of value.pages.entries()) {
    if (!validatePage(raw)) {
      issues.push(`第 ${index + 1} 页结构非法`);
      continue;
    }
    if (pageIds.has(raw.id)) issues.push(`页面 id ${raw.id} 重复`);
    pageIds.add(raw.id);
    pages.push(raw);
  }

  const assets: Record<string, ImageAsset> = {};
  if (value.assets !== undefined) {
    if (!isRecord(value.assets)) {
      issues.push('场景 assets 必须是对象');
    } else {
      for (const [key, raw] of Object.entries(value.assets)) {
        if (RESERVED_KEYS.has(key)) {
          issues.push(`资产 id ${key} 是保留键`);
          continue;
        }
        if (!validateAsset(raw)) {
          issues.push(`资产 ${key} 结构非法`);
          continue;
        }
        if (raw.id !== key) issues.push(`资产 ${key} 的 id 与键名不一致`);
        assets[key] = raw;
      }
    }
  }

  const nodes = value.nodes as Record<string, SceneNode>;
  const nodeIds = Object.keys(nodes);
  for (const key of nodeIds) {
    if (RESERVED_KEYS.has(key)) {
      issues.push(`节点 id ${key} 是保留键`);
      continue;
    }
    validateNode(nodes[key], key, assets, issues);
  }

  const roots = new Set<string>();
  for (const page of pages) {
    const root = nodes[page.rootId];
    if (!root) {
      issues.push(`页面 ${page.id} 的根节点 ${page.rootId} 不存在`);
      continue;
    }
    if (root.type !== 'page') issues.push(`页面 ${page.id} 的根节点必须是 page`);
    if (root.parentId !== null) issues.push(`页面 ${page.id} 的根节点 parentId 必须为 null`);
    if (roots.has(page.rootId)) issues.push(`根节点 ${page.rootId} 被多个页面复用`);
    roots.add(page.rootId);
  }

  const owners = new Map<string, string>();
  for (const id of nodeIds) {
    const node = nodes[id];
    if (!node || !isStringArray(node.children)) continue;
    for (const childId of node.children) {
      const child = nodes[childId];
      if (!child) {
        issues.push(`节点 ${id} 引用了不存在的子节点 ${childId}`);
        continue;
      }
      if (child.parentId !== id) issues.push(`节点 ${childId} 的 parentId 与父节点 ${id} 不一致`);
      const owner = owners.get(childId);
      if (owner && owner !== id) issues.push(`节点 ${childId} 同时挂在 ${owner} 与 ${id} 下`);
      owners.set(childId, id);
    }
    if (node.parentId !== null) {
      const parent = nodes[node.parentId];
      if (!parent) issues.push(`节点 ${id} 的父节点 ${node.parentId} 不存在`);
      else if (!isStringArray(parent.children) || !parent.children.includes(id)) {
        issues.push(`节点 ${id} 声称父节点是 ${node.parentId}，但父节点 children 里没有它`);
      }
    }
  }

  for (const id of nodeIds) {
    const node = nodes[id];
    if (!node?.isMask) continue;
    const parent = node.parentId ? nodes[node.parentId] : undefined;
    if (!parent) continue;
    if (parent.type !== 'frame' && parent.type !== 'section' && parent.type !== 'group') {
      issues.push(`蒙版 ${id} 的父级必须是画板、区块或编组`);
      continue;
    }
    if (!isStringArray(node.children) || node.children.length > 0) {
      issues.push(`蒙版 ${id} 不能包含子图层`);
    }
    if (node.type !== 'rect' && node.type !== 'ellipse' && node.type !== 'path') {
      issues.push(`蒙版 ${id} 必须是矩形、椭圆或钢笔路径`);
    }
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const walk = (id: string): void => {
    const node = nodes[id];
    if (!node) return;
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      issues.push(`节点树存在环：${id}`);
      return;
    }
    visiting.add(id);
    const children = isStringArray(node.children) ? node.children : [];
    for (const childId of children) walk(childId);
    visiting.delete(id);
    visited.add(id);
  };
  for (const rootId of roots) walk(rootId);
  for (const id of nodeIds) {
    if (!visited.has(id)) issues.push(`节点 ${id} 不可从任何页面根节点到达`);
  }

  if (issues.length > 0) return { ok: false, errors: limitIssues(issues) };
  return { ok: true, doc: value as unknown as GromaDoc };
}

export function isGromaDoc(value: unknown): value is GromaDoc {
  return validateDoc(value).ok;
}
