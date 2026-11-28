import type { GromaDoc } from './types';
import { libraryComponents, type LibraryComponent } from './variants';

export interface ExternalComponent extends LibraryComponent {
  projectId: string;
  projectName: string;
  issues: string[];
  transferable: boolean;
  /** 来源组件已发布到本机库的版本；0 表示尚未发布。 */
  publishedVersion: number;
  publishedAt?: string;
}

/**
 * 跨工程导入只搬不依赖外部工程的图层。
 * 图片资产、命名样式、变量、嵌套实例和原型跳转都指向来源工程，
 * 直接复制会留下悬空 id，所以先判成“不可迁移”，在库里明确标出来。
 */
export function componentTransferIssues(doc: GromaDoc, id: string): string[] {
  const root = doc.nodes[id];
  if (!root) return ['组件不存在'];
  const issues = new Set<string>();
  const visit = (nodeId: string) => {
    const node = doc.nodes[nodeId];
    if (!node) return;
    if (node.variantSetId || node.isVariantSet) issues.add('变体组件');
    if (node.assetId || node.imageFill) issues.add('图片资产');
    if (node.styleRefs && Object.keys(node.styleRefs).length > 0) issues.add('命名样式');
    if (node.variableBindings && Object.keys(node.variableBindings).length > 0) issues.add('变量绑定');
    if (node.componentOf) issues.add('嵌套实例');
    if (node.prototype) issues.add('原型跳转');
    if (nodeId !== id && node.isComponent) issues.add('子组件');
    for (const childId of node.children) visit(childId);
  };
  visit(id);
  return [...issues];
}

/** 组件库的跨工程视图：当前工程之外的主组件，带来源工程与迁移检查结果。 */
export function externalComponents(doc: GromaDoc, projectId: string, projectName: string): ExternalComponent[] {
  return libraryComponents(doc).map((item) => {
    const issues = componentTransferIssues(doc, item.id);
    const publication = doc.nodes[item.id]?.libraryPublication;
    return {
      ...item,
      projectId,
      projectName,
      issues,
      transferable: issues.length === 0,
      publishedVersion: publication?.version ?? 0,
      publishedAt: publication?.publishedAt,
    };
  });
}

export type ComponentSourceState = 'same' | 'changed' | 'source-updated' | 'missing' | 'blocked';

/** 只比较会随来源更新的内容：id、父级、库来源和根节点位置都是本地坐标。 */
function comparableSubtree(doc: GromaDoc, id: string, root: boolean): unknown {
  const node = doc.nodes[id];
  if (!node) return null;
  const copy: Partial<typeof node> = { ...node };
  delete copy.id;
  delete copy.parentId;
  delete copy.librarySource;
  delete copy.locked;
  delete copy.libraryPublication;
  return {
    ...copy,
    x: root ? 0 : node.x,
    y: root ? 0 : node.y,
    children: node.children.map((childId) => comparableSubtree(doc, childId, false)),
  };
}

/**
 * 判断导入主组件相对来源是否已变化。
 * missing 表示来源工程/组件已被删；blocked 表示来源本身含外部依赖，更新会留下悬空引用。
 */
export function componentSourceState(
  doc: GromaDoc,
  targetId: string,
  sourceDoc: GromaDoc,
  sourceId: string,
): ComponentSourceState {
  const target = doc.nodes[targetId];
  if (!target?.librarySource) return 'missing';
  const sourceRoot = sourceDoc.nodes[sourceId];
  if (!sourceRoot || sourceRoot.type !== 'frame' || !sourceRoot.isComponent) return 'missing';
  if (componentTransferIssues(sourceDoc, sourceId).length > 0) return 'blocked';
  const sourceVersion = sourceRoot.libraryPublication?.version ?? 0;
  const localVersion = target.librarySource.version ?? 0;
  if (sourceVersion > localVersion) return 'source-updated';
  const a = JSON.stringify(comparableSubtree(doc, targetId, true));
  const b = JSON.stringify(comparableSubtree(sourceDoc, sourceId, true));
  return a === b ? 'same' : 'changed';
}

