import type { GromaDoc } from './types';
import { libraryComponents, type LibraryComponent } from './variants';

export interface ExternalComponent extends LibraryComponent {
  projectId: string;
  projectName: string;
  issues: string[];
  transferable: boolean;
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
    return {
      ...item,
      projectId,
      projectName,
      issues,
      transferable: issues.length === 0,
    };
  });
}
