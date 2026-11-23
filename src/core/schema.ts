import type { GromaDoc, Guide, NodeType, Page, Paint, SceneNode } from './types';

const NODE_TYPES: NodeType[] = ['page', 'frame', 'section', 'rect', 'ellipse', 'text', 'group'];
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

function validatePaint(value: unknown): value is Paint {
  if (!isRecord(value)) return false;
  return value.type === 'solid' && typeof value.color === 'string' && isFiniteNumber(value.opacity);
}

function validateGuide(value: unknown): value is Guide {
  if (!isRecord(value)) return false;
  return (value.axis === 'x' || value.axis === 'y') && isFiniteNumber(value.position);
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

function validateNode(node: SceneNode, key: string, issues: string[]): void {
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
    issues.push(`节点 ${key} 的 fills 必须是合法的纯色填充数组`);
  }
  for (const field of ['visible', 'locked', 'clipContent'] as const) {
    if (typeof node[field] !== 'boolean') issues.push(`节点 ${key} 的 ${field} 必须是布尔值`);
  }
  if (node.type === 'text') {
    if (typeof node.text !== 'string') issues.push(`文本节点 ${key} 缺少 text`);
    if (!isFiniteNumber(node.fontSize) || node.fontSize <= 0) issues.push(`文本节点 ${key} 的 fontSize 非法`);
    if (!isFiniteNumber(node.fontWeight)) issues.push(`文本节点 ${key} 的 fontWeight 非法`);
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

  const nodes = value.nodes as Record<string, SceneNode>;
  const nodeIds = Object.keys(nodes);
  for (const key of nodeIds) {
    if (RESERVED_KEYS.has(key)) {
      issues.push(`节点 id ${key} 是保留键`);
      continue;
    }
    validateNode(nodes[key], key, issues);
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
