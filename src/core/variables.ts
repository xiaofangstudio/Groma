import type { GromaDoc, SceneNode, Variable, VariableCollection, VariableType } from './types';

export type VariableProp = 'fill' | 'stroke' | 'cornerRadius' | 'strokeWidth' | 'gap' | 'padding' | 'fontSize';

export const VARIABLE_PROP_LABEL: Record<VariableProp, string> = {
  fill: '填充',
  stroke: '描边颜色',
  cornerRadius: '圆角',
  strokeWidth: '描边宽度',
  gap: '自动布局间距',
  padding: '内边距',
  fontSize: '字号',
};

const COLOR_PROPS = new Set<VariableProp>(['fill', 'stroke']);

/** 节点当前可绑定的变量属性；只露出节点真正持有的字段。 */
export function variableBindingProps(node: SceneNode): VariableProp[] {
  if (node.type === 'page') return [];
  const props: VariableProp[] = ['fill'];
  if (node.strokes?.length) {
    props.push('stroke', 'strokeWidth');
  }
  if (node.type !== 'text') props.push('cornerRadius');
  if (node.layout) props.push('gap', 'padding');
  if (node.fontSize !== undefined) props.push('fontSize');
  return props;
}

export function variableCollections(doc: GromaDoc): VariableCollection[] {
  return Object.values(doc.variables ?? {}).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
}

export function variableById(doc: GromaDoc, variableId: string): Variable | null {
  for (const collection of Object.values(doc.variables ?? {})) {
    const variable = collection.variables[variableId];
    if (variable) return variable;
  }
  return null;
}

export function activeModeId(doc: GromaDoc, collection: VariableCollection): string {
  const mode = doc.variableModes?.[collection.id];
  return collection.modes.some((item) => item.id === mode) ? (mode as string) : collection.defaultModeId;
}

export function variableValue(doc: GromaDoc, variableId: string, modeId?: string): string | number | boolean | null {
  const seen = new Set<string>();
  let currentId = variableId;
  let requestedMode = modeId;
  while (!seen.has(currentId)) {
    seen.add(currentId);
    const variable = variableById(doc, currentId);
    if (!variable) return null;
    if (variable.alias) {
      currentId = variable.alias;
      requestedMode = undefined;
      continue;
    }
    const collection = doc.variables?.[variable.collectionId];
    if (!collection) return null;
    const mode = requestedMode ?? activeModeId(doc, collection);
    const value = variable.values[mode];
    return value === undefined ? null : value;
  }
  return null;
}

export function canAliasVariable(doc: GromaDoc, sourceId: string, targetId: string): boolean {
  const source = variableById(doc, sourceId);
  const target = variableById(doc, targetId);
  if (!source || !target || source.id === target.id || source.type !== target.type) return false;
  const seen = new Set<string>([target.id]);
  let cursor: Variable | null = target;
  while (cursor?.alias) {
    if (cursor.alias === source.id) return false;
    if (seen.has(cursor.alias)) return false;
    seen.add(cursor.alias);
    cursor = variableById(doc, cursor.alias);
  }
  return true;
}

/** 变量本身或 alias 链上是否落在指定集合；用于 Mode/值变更后精确刷新依赖节点。 */
export function variableDependsOnCollection(doc: GromaDoc, variableId: string, collectionId: string): boolean {
  const seen = new Set<string>();
  let cursor = variableById(doc, variableId);
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    if (cursor.collectionId === collectionId) return true;
    if (!cursor.alias) return false;
    cursor = variableById(doc, cursor.alias);
  }
  return false;
}

export function canBindVariable(variable: Variable, prop: VariableProp): boolean {
  return COLOR_PROPS.has(prop) ? variable.type === 'color' : variable.type === 'number';
}

/** 返回把变量当前 Mode 值写入字面属性后的节点；不改变绑定本身。 */
export function materializeNodeVariables(doc: GromaDoc, node: SceneNode): SceneNode {
  const bindings = node.variableBindings;
  if (!bindings) return node;
  let next = node;
  const fillId = bindings.fill;
  if (fillId) {
    const value = variableValue(doc, fillId);
    if (typeof value === 'string') {
      const first = next.fills[0];
      if (first?.type === 'solid') {
        if (first.color.toLowerCase() !== value.toLowerCase()) {
          next = { ...next, fills: [{ ...first, color: value }, ...next.fills.slice(1)] };
        }
      } else {
        next = { ...next, fills: [{ type: 'solid', color: value, opacity: 1 }, ...next.fills] };
      }
    }
  }
  const radiusId = bindings.cornerRadius;
  if (radiusId) {
    const value = variableValue(doc, radiusId);
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      const rounded = Math.round(value);
      if (next.cornerRadius !== rounded || next.cornerRadii !== undefined) {
        next = { ...next, cornerRadius: rounded, cornerRadii: undefined };
      }
    }
  }
  const strokeId = bindings.stroke;
  if (strokeId) {
    const value = variableValue(doc, strokeId);
    const strokes = next.strokes ?? [];
    const first = strokes[0];
    if (typeof value === 'string' && first && first.color.toLowerCase() !== value.toLowerCase()) {
      next = { ...next, strokes: [{ ...first, color: value }, ...strokes.slice(1)] };
    }
  }
  const strokeWidthId = bindings.strokeWidth;
  if (strokeWidthId) {
    const value = variableValue(doc, strokeWidthId);
    const strokes = next.strokes ?? [];
    const first = strokes[0];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && first) {
      const width = Math.round(value * 100) / 100;
      if (first.width !== width) next = { ...next, strokes: [{ ...first, width }, ...strokes.slice(1)] };
    }
  }
  const gapId = bindings.gap;
  if (gapId && next.layout) {
    const value = variableValue(doc, gapId);
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      const gap = Math.round(value);
      if (next.layout.gap !== gap) next = { ...next, layout: { ...next.layout, gap } };
    }
  }
  const paddingId = bindings.padding;
  if (paddingId && next.layout) {
    const value = variableValue(doc, paddingId);
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      const padding = Math.round(value);
      const current = next.layout.padding;
      if (current.top !== padding || current.right !== padding || current.bottom !== padding || current.left !== padding) {
        next = { ...next, layout: { ...next.layout, padding: { top: padding, right: padding, bottom: padding, left: padding } } };
      }
    }
  }
  const fontSizeId = bindings.fontSize;
  if (fontSizeId) {
    const value = variableValue(doc, fontSizeId);
    if (typeof value === 'number' && Number.isFinite(value) && value > 0 && next.fontSize !== undefined) {
      const fontSize = Math.round(value);
      if (next.fontSize !== fontSize) next = { ...next, fontSize };
    }
  }
  return next;
}

export interface MaterializeResult {
  doc: GromaDoc;
  beforeNodes: Record<string, SceneNode>;
  afterNodes: Record<string, SceneNode>;
}

/** 批量刷新已绑定节点；collectionId 存在时只刷新该集合的变量。 */
export function materializeVariables(doc: GromaDoc, collectionId?: string): MaterializeResult {
  const beforeNodes: Record<string, SceneNode> = {};
  const afterNodes: Record<string, SceneNode> = {};
  const nodes = { ...doc.nodes };
  for (const node of Object.values(doc.nodes)) {
    const bindings = node.variableBindings;
    if (!bindings) continue;
    if (collectionId) {
      const ids = Object.values(bindings).filter((id): id is string => Boolean(id));
      if (!ids.some((id) => variableDependsOnCollection(doc, id, collectionId))) continue;
    }
    const next = materializeNodeVariables(doc, node);
    if (JSON.stringify(next) !== JSON.stringify(node)) {
      beforeNodes[node.id] = node;
      afterNodes[node.id] = next;
      nodes[node.id] = next;
    }
  }
  return {
    doc: Object.keys(afterNodes).length ? { ...doc, nodes } : doc,
    beforeNodes,
    afterNodes,
  };
}

export function defaultValueForType(type: VariableType): string | number | boolean {
  if (type === 'color') return '#2563EB';
  if (type === 'number') return 12;
  if (type === 'boolean') return true;
  return '';
}

export function variableTypeLabel(type: VariableType): string {
  if (type === 'color') return '颜色';
  if (type === 'number') return '数值';
  if (type === 'boolean') return '布尔';
  return '文本';
}
