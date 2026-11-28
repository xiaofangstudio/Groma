import type { GromaDoc, InstanceOverride, SceneNode } from './types';

const OVERRIDE_KEYS: Array<keyof InstanceOverride> = [
  'x',
  'y',
  'w',
  'h',
  'rotation',
  'opacity',
  'visible',
  'text',
  'fontSize',
  'fontWeight',
  'fills',
  'cornerRadius',
];

/** 从节点向上找最近的组件实例根；节点自身就是实例根时返回 null。 */
export function ancestorInstance(doc: GromaDoc, nodeId: string): SceneNode | null {
  let current = doc.nodes[nodeId];
  const guard = new Set<string>();
  while (current && current.parentId && !guard.has(current.id)) {
    guard.add(current.id);
    current = doc.nodes[current.parentId];
    if (!current) break;
    if (current.componentOf) return current;
  }
  return null;
}

/** 实例根到节点的子索引路径；节点不属于该实例时返回 null。 */
export function instancePath(doc: GromaDoc, instanceId: string, nodeId: string): string | null {
  let current = doc.nodes[nodeId];
  const root = doc.nodes[instanceId];
  if (!current || !root || current.id === root.id) return null;
  const segments: string[] = [];
  const guard = new Set<string>();
  while (current && current.id !== root.id) {
    if (guard.has(current.id) || !current.parentId) return null;
    guard.add(current.id);
    const parent = doc.nodes[current.parentId];
    if (!parent) return null;
    const index = parent.children.indexOf(current.id);
    if (index < 0) return null;
    segments.unshift(String(index));
    current = parent;
  }
  return current?.id === root.id ? segments.join('.') : null;
}

export function overrideFromPatch(patch: Record<string, unknown>): InstanceOverride {
  const out: InstanceOverride = {};
  for (const key of OVERRIDE_KEYS) {
    if (patch[key] === undefined) continue;
    (out as Record<string, unknown>)[key] = patch[key];
  }
  return out;
}

export function mergeInstanceOverride(
  overrides: Record<string, InstanceOverride> | undefined,
  path: string,
  patch: InstanceOverride,
): Record<string, InstanceOverride> | undefined {
  if (Object.keys(patch).length === 0) return overrides;
  const next = { ...(overrides ?? {}), [path]: { ...(overrides?.[path] ?? {}), ...patch } };
  return next;
}

export function overrideLabels(override: InstanceOverride | undefined): string[] {
  if (!override) return [];
  const labels: Record<keyof InstanceOverride, string> = {
    x: '位置',
    y: '位置',
    w: '尺寸',
    h: '尺寸',
    rotation: '旋转',
    opacity: '透明度',
    visible: '显隐',
    text: '文本',
    fontSize: '字号',
    fontWeight: '字重',
    fills: '填充',
    cornerRadius: '圆角',
  };
  const seen = new Set<string>();
  for (const key of OVERRIDE_KEYS) {
    if (override[key] === undefined) continue;
    seen.add(labels[key]);
  }
  return [...seen];
}

export function nodeAtPath(doc: GromaDoc, rootId: string, path: string): SceneNode | null {
  const segments = path.split('.').filter(Boolean);
  let node = doc.nodes[rootId];
  for (const segment of segments) {
    const index = Number(segment);
    if (!Number.isInteger(index) || index < 0 || !node) return null;
    const childId = node.children[index];
    if (!childId) return null;
    node = doc.nodes[childId];
  }
  return node?.id === rootId ? null : node ?? null;
}

/** 替换组件时按路径核对旧/新主组件同位置图层，同类型同名才保留覆盖。 */
export function remapOverridesForSwap(
  doc: GromaDoc,
  overrides: Record<string, InstanceOverride> | undefined,
  oldMasterId: string,
  newMasterId: string,
): Record<string, InstanceOverride> | undefined {
  if (!overrides) return undefined;
  const next: Record<string, InstanceOverride> = {};
  for (const [path, override] of Object.entries(overrides)) {
    const oldNode = nodeAtPath(doc, oldMasterId, path);
    const newNode = nodeAtPath(doc, newMasterId, path);
    if (!oldNode || !newNode) continue;
    if (oldNode.type !== newNode.type || oldNode.name !== newNode.name) continue;
    next[path] = override;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

/** 把实例根上的覆盖应用到当前子层；主组件同步后调用。 */
export function applyInstanceOverrides(doc: GromaDoc, instanceId: string): GromaDoc {
  const root = doc.nodes[instanceId];
  const overrides = root?.instanceOverrides;
  if (!root || !overrides) return doc;
  let nodes = doc.nodes;
  let changed = false;
  for (const [path, override] of Object.entries(overrides)) {
    const target = nodeAtPath({ ...doc, nodes }, instanceId, path);
    if (!target) continue;
    const next: SceneNode = { ...target };
    for (const key of OVERRIDE_KEYS) {
      const value = override[key];
      if (value !== undefined) (next as unknown as Record<string, unknown>)[key] = value;
    }
    if (JSON.stringify(next) === JSON.stringify(target)) continue;
    nodes = { ...nodes, [next.id]: next };
    changed = true;
  }
  return changed ? { ...doc, nodes } : doc;
}
