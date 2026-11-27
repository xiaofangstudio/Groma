import type { GromaDoc, SceneNode } from './types';

export interface DocDiff {
  added: number;
  removed: number;
  changed: number;
  addedNames: string[];
  removedNames: string[];
  changedNames: string[];
  identical: boolean;
}

function visualSignature(node: SceneNode): string {
  const rest: Record<string, unknown> = { ...node };
  delete rest.children;
  return JSON.stringify(rest) + '|' + node.children.join(',');
}

/** 比较两个文档版本：节点增删改；页面节点不计入图层数。 */
export function diffDocs(before: GromaDoc, after: GromaDoc): DocDiff {
  const beforeNodes = new Map<string, SceneNode>();
  const afterNodes = new Map<string, SceneNode>();
  for (const node of Object.values(before.nodes)) if (node.type !== 'page') beforeNodes.set(node.id, node);
  for (const node of Object.values(after.nodes)) if (node.type !== 'page') afterNodes.set(node.id, node);

  const addedNames: string[] = [];
  const removedNames: string[] = [];
  const changedNames: string[] = [];
  for (const [id, node] of afterNodes) {
    const old = beforeNodes.get(id);
    if (!old) addedNames.push(node.name);
    else if (visualSignature(old) !== visualSignature(node)) changedNames.push(node.name);
  }
  for (const [id, node] of beforeNodes) {
    if (!afterNodes.has(id)) removedNames.push(node.name);
  }

  return {
    added: addedNames.length,
    removed: removedNames.length,
    changed: changedNames.length,
    addedNames,
    removedNames,
    changedNames,
    identical: addedNames.length + removedNames.length + changedNames.length === 0,
  };
}

export function diffSummary(diff: DocDiff): string {
  if (diff.identical) return '与当前一致';
  return `+${diff.added} / -${diff.removed} / ~${diff.changed}`;
}
