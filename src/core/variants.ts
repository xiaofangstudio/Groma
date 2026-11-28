import type { GromaDoc, Page, SceneNode } from './types';

export interface VariantOption {
  id: string;
  name: string;
  props: Record<string, string>;
  w: number;
  h: number;
}

export interface LibraryComponent {
  id: string;
  name: string;
  pageId: string;
  pageName: string;
  variantSetId?: string;
  variantLabel?: string;
  w: number;
  h: number;
  instanceCount: number;
}

/** 变体主组件或实例所属的变体集；不是变体时返回 null。 */
export function variantSetOf(doc: GromaDoc, node: SceneNode | null | undefined): SceneNode | null {
  if (!node) return null;
  const master = node.componentOf ? doc.nodes[node.componentOf] : node;
  const setId = master?.variantSetId;
  if (!setId) return null;
  const set = doc.nodes[setId];
  return set?.isVariantSet ? set : null;
}

export function variantLabel(node: SceneNode): string {
  const props = node.variantProps;
  if (!props) return node.name;
  const entries = Object.entries(props).sort(([a], [b]) => a.localeCompare(b, 'zh-Hans-CN'));
  return entries.map(([, value]) => value).join(' / ');
}

export function variantOptions(doc: GromaDoc, setId: string): VariantOption[] {
  const set = doc.nodes[setId];
  if (!set?.isVariantSet) return [];
  return set.children
    .map((id) => doc.nodes[id])
    .filter((node): node is SceneNode => Boolean(node?.isComponent))
    .map((node) => ({
      id: node.id,
      name: node.name,
      props: node.variantProps ?? {},
      w: node.w,
      h: node.h,
    }));
}

/** 同一变体集内所有变体的属性名并集，按首个变体顺序。 */
export function variantPropertyNames(doc: GromaDoc, setId: string): string[] {
  const options = variantOptions(doc, setId);
  const seen = new Set<string>();
  for (const option of options) for (const name of Object.keys(option.props)) seen.add(name);
  return [...seen];
}

export interface VariantFacet {
  values: Record<string, string>;
  label: string;
}

/** 三属性以上时，把前两个轴之外属性组合成可筛选的固定值。 */
export function variantFacets(options: VariantOption[], extraNames: string[]): VariantFacet[] {
  if (extraNames.length === 0) return [];
  const facets = new Map<string, VariantFacet>();
  for (const option of options) {
    const values: Record<string, string> = {};
    for (const name of extraNames) values[name] = option.props[name] ?? '';
    const key = extraNames.map((name) => values[name]).join('\u0001');
    if (facets.has(key)) continue;
    facets.set(key, {
      values,
      label: extraNames.map((name) => `${name}：${values[name] || '空'}`).join(' · '),
    });
  }
  return [...facets.values()];
}

export function variantMatchesFacet(option: VariantOption, extraNames: string[], values: Record<string, string>): boolean {
  return extraNames.every((name) => (option.props[name] ?? '') === (values[name] ?? ''));
}

/** 从任意节点向上找到所属页面。 */
export function pageOfNode(doc: GromaDoc, nodeId: string): Page | null {
  let current: SceneNode | undefined = doc.nodes[nodeId];
  const guard = new Set<string>();
  while (current && !guard.has(current.id)) {
    guard.add(current.id);
    if (current.type === 'page') {
      const page = doc.pages.find((item) => item.rootId === current?.id);
      if (page) return page;
    }
    if (!current.parentId) break;
    current = doc.nodes[current.parentId];
  }
  return null;
}

/** 跨页本地组件库：列出全部主组件，并统计直接实例数。 */
export function libraryComponents(doc: GromaDoc): LibraryComponent[] {
  const instanceCounts = new Map<string, number>();
  for (const node of Object.values(doc.nodes)) {
    if (!node.componentOf) continue;
    instanceCounts.set(node.componentOf, (instanceCounts.get(node.componentOf) ?? 0) + 1);
  }
  const out: LibraryComponent[] = [];
  for (const node of Object.values(doc.nodes)) {
    if (!node.isComponent || node.type !== 'frame') continue;
    const page = pageOfNode(doc, node.id);
    if (!page) continue;
    out.push({
      id: node.id,
      name: node.name,
      pageId: page.id,
      pageName: page.name,
      variantSetId: node.variantSetId,
      variantLabel: node.variantSetId ? variantLabel(node) : undefined,
      w: node.w,
      h: node.h,
      instanceCount: instanceCounts.get(node.id) ?? 0,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
}
