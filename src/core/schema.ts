import type { GromaDoc, Guide, ImageAsset, NodeType, Page, Paint, SceneNode, Style, StyleKind, Variable, VariableCollection, VariableMode } from './types';

const NODE_TYPES: NodeType[] = ['page', 'frame', 'section', 'rect', 'ellipse', 'text', 'path', 'image', 'group', 'slice'];
const NODE_TYPE_SET = new Set<string>(NODE_TYPES);
const HORIZONTAL_CONSTRAINTS = new Set(['left', 'right', 'center', 'leftRight', 'scale']);
const VERTICAL_CONSTRAINTS = new Set(['top', 'bottom', 'center', 'topBottom', 'scale']);
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
  if (value.visible !== undefined && typeof value.visible !== 'boolean') return false;
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

function validateEffect(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!isFiniteNumber(value.blur) || value.blur < 0 || value.blur > 1000) return false;
  if (typeof value.visible !== 'boolean') return false;
  if (value.type === 'layer-blur') return true;
  if (value.type !== 'drop-shadow') return false;
  return (
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    typeof value.color === 'string' &&
    isFiniteNumber(value.opacity) &&
    value.opacity >= 0 &&
    value.opacity <= 1
  );
}

const STYLE_KINDS = new Set<StyleKind>(['fill', 'stroke', 'effect', 'text']);

function validateTextStyle(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!isFiniteNumber(value.fontSize) || value.fontSize <= 0) return false;
  if (!isFiniteNumber(value.fontWeight) || value.fontWeight < 0) return false;
  if (typeof value.fontFamily !== 'string' || value.fontFamily.length === 0) return false;
  if (typeof value.italic !== 'boolean') return false;
  if (!['left', 'center', 'right'].includes(String(value.align))) return false;
  if (!isFiniteNumber(value.lineHeight) || value.lineHeight <= 0) return false;
  if (!isFiniteNumber(value.letterSpacing)) return false;
  if (!isFiniteNumber(value.paragraphSpacing) || value.paragraphSpacing < 0) return false;
  if (!['none', 'bullet', 'number'].includes(String(value.listStyle))) return false;
  return true;
}

function validateStyle(value: unknown): value is Style {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string' || value.id.length === 0) return false;
  if (typeof value.name !== 'string' || value.name.length === 0) return false;
  if (!STYLE_KINDS.has(value.kind as StyleKind)) return false;
  if (value.kind === 'fill') {
    return Array.isArray(value.fills) && value.fills.every(validatePaint);
  }
  if (value.kind === 'stroke') {
    return Array.isArray(value.strokes) && value.strokes.every(validateStroke);
  }
  if (value.kind === 'effect') {
    return Array.isArray(value.effects) && value.effects.length <= 12 && value.effects.every(validateEffect);
  }
  return validateTextStyle(value.textStyle);
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

function validateVariableValue(type: string, value: unknown): boolean {
  if (type === 'color') return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
  if (type === 'number') return isFiniteNumber(value);
  if (type === 'string') return typeof value === 'string' && value.length <= 200;
  if (type === 'boolean') return typeof value === 'boolean';
  return false;
}

function validateAutoLayout(value: unknown): boolean {  if (!isRecord(value)) return false;
  if (!['horizontal', 'vertical'].includes(String(value.mode))) return false;
  if (!isFiniteNumber(value.gap) || value.gap < 0 || value.gap > 10000) return false;
  if (!isRecord(value.padding)) return false;
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    if (!isFiniteNumber(value.padding[side]) || Number(value.padding[side]) < 0 || Number(value.padding[side]) > 100000) {
      return false;
    }
  }
  if (!['start', 'center', 'end', 'stretch'].includes(String(value.align))) return false;
  if (!['start', 'center', 'end', 'space-between'].includes(String(value.justify))) return false;
  if (typeof value.hug !== 'boolean') return false;
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

function validateInstanceOverrides(value: unknown, key: string, issues: string[]): void {
  if (!isRecord(value)) {
    issues.push(`节点 ${key} 的 instanceOverrides 必须是对象`);
    return;
  }
  const numeric = new Set(['x', 'y', 'w', 'h', 'rotation', 'opacity', 'fontSize', 'fontWeight', 'cornerRadius']);
  const allowed = new Set([...numeric, 'visible', 'text', 'fills']);
  for (const [path, override] of Object.entries(value)) {
    if (!/^\d+(\.\d+)*$/.test(path)) {
      issues.push(`节点 ${key} 的实例覆盖路径不合法 ${path}`);
      continue;
    }
    if (!isRecord(override)) {
      issues.push(`节点 ${key} 的实例覆盖 ${path} 必须是对象`);
      continue;
    }
    for (const [field, fieldValue] of Object.entries(override)) {
      if (!allowed.has(field)) {
        issues.push(`节点 ${key} 的实例覆盖 ${path} 含未知字段 ${field}`);
        continue;
      }
      if (numeric.has(field) && !isFiniteNumber(fieldValue)) {
        issues.push(`节点 ${key} 的实例覆盖 ${path}.${field} 必须是数字`);
      }
      if (field === 'visible' && typeof fieldValue !== 'boolean') {
        issues.push(`节点 ${key} 的实例覆盖 ${path}.visible 必须是布尔值`);
      }
      if (field === 'text' && typeof fieldValue !== 'string') {
        issues.push(`节点 ${key} 的实例覆盖 ${path}.text 必须是文本`);
      }
      if (field === 'fills' && (!Array.isArray(fieldValue) || !fieldValue.every(validatePaint))) {
        issues.push(`节点 ${key} 的实例覆盖 ${path}.fills 必须是合法填充数组`);
      }
    }
  }
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
  if (node.cornerRadii !== undefined) {
    if (
      !Array.isArray(node.cornerRadii) ||
      node.cornerRadii.length !== 4 ||
      !node.cornerRadii.every((value) => isFiniteNumber(value) && value >= 0 && value <= 100000)
    ) {
      issues.push(`节点 ${key} 的 cornerRadii 必须是四个 0–100000 的有限数字（左上/右上/右下/左下）`);
    }
  }
  if (!Array.isArray(node.fills) || !node.fills.every(validatePaint)) {
    issues.push(`节点 ${key} 的 fills 必须是合法的填充数组`);
  }
  if (node.strokes !== undefined && (!Array.isArray(node.strokes) || !node.strokes.every(validateStroke))) {
    issues.push(`节点 ${key} 的 strokes 必须是合法的描边数组`);
  }
  if (
    node.effects !== undefined &&
    (!Array.isArray(node.effects) || node.effects.length > 12 || !node.effects.every(validateEffect))
  ) {
    issues.push(`节点 ${key} 的 effects 必须是合法的效果数组`);
  }
  for (const field of ['visible', 'locked', 'clipContent'] as const) {
    if (typeof node[field] !== 'boolean') issues.push(`节点 ${key} 的 ${field} 必须是布尔值`);
  }
  if (node.constraints !== undefined) {
    if (
      !isRecord(node.constraints) ||
      !HORIZONTAL_CONSTRAINTS.has(String(node.constraints.horizontal)) ||
      !VERTICAL_CONSTRAINTS.has(String(node.constraints.vertical))
    ) {
      issues.push(`节点 ${key} 的 constraints 必须是合法的水平 / 垂直约束`);
    }
  }
  if (node.layout !== undefined) {
    if (!validateAutoLayout(node.layout)) {
      issues.push(`节点 ${key} 的 layout 必须是合法的自动布局配置`);
    } else if (!['frame', 'section', 'group'].includes(node.type)) {
      issues.push(`节点 ${key} 的自动布局只支持画板/区块/分组`);
    }
  }
  if (node.isComponent !== undefined) {
    if (typeof node.isComponent !== 'boolean') issues.push(`节点 ${key} 的 isComponent 必须是布尔值`);
    if (node.type !== 'frame') issues.push(`节点 ${key} 只有画板能作为主组件`);
  }
  if (node.componentOf !== undefined) {
    if (typeof node.componentOf !== 'string' || !node.componentOf) {
      issues.push(`节点 ${key} 的 componentOf 必须是非空 id`);
    } else if (node.type !== 'frame') {
      issues.push(`节点 ${key} 只有画板能作为组件实例`);
    }
    if (node.isComponent) issues.push(`节点 ${key} 不能同时是主组件和实例`);
  }
  if (node.librarySource !== undefined) {
    if (!isRecord(node.librarySource)) {
      issues.push(`节点 ${key} 的 librarySource 必须是对象`);
    } else {
      const source = node.librarySource;
      for (const field of ['projectId', 'nodeId'] as const) {
        if (typeof source[field] !== 'string' || !source[field]) {
          issues.push(`节点 ${key} 的 librarySource.${field} 必须是非空 id`);
        }
      }
      for (const field of ['projectName', 'nodeName'] as const) {
        if (typeof source[field] !== 'string') issues.push(`节点 ${key} 的 librarySource.${field} 必须是字符串`);
      }
      if (!node.isComponent) issues.push(`节点 ${key} 只有主组件能记录本地库来源`);
    }
  }
  if (node.instanceOverrides !== undefined) {
    if (!node.componentOf) issues.push(`节点 ${key} 只有组件实例能保存实例覆盖`);
    validateInstanceOverrides(node.instanceOverrides, key, issues);
  }
  if (node.isVariantSet !== undefined) {
    if (typeof node.isVariantSet !== 'boolean') issues.push(`节点 ${key} 的 isVariantSet 必须是布尔值`);
    if (node.type !== 'frame') issues.push(`节点 ${key} 只有画板能作为变体集`);
    if (node.isComponent) issues.push(`节点 ${key} 的变体集不能同时是主组件`);
    if (node.componentOf) issues.push(`节点 ${key} 的变体集不能同时是实例`);
  }
  if (node.variantSetId !== undefined) {
    if (typeof node.variantSetId !== 'string' || !node.variantSetId) {
      issues.push(`节点 ${key} 的 variantSetId 必须是非空 id`);
    }
    if (node.type !== 'frame' || !node.isComponent) {
      issues.push(`节点 ${key} 只有主组件画板能属于变体集`);
    }
    if (node.isVariantSet) issues.push(`节点 ${key} 的变体集不能自己属于另一个变体集`);
  }
  if (node.variantProps !== undefined) {
    if (!isRecord(node.variantProps)) {
      issues.push(`节点 ${key} 的 variantProps 必须是对象`);
    } else {
      const props = Object.entries(node.variantProps);
      if (props.length === 0) issues.push(`节点 ${key} 的 variantProps 不能为空`);
      for (const [prop, value] of props) {
        if (!prop.trim() || prop.length > 64) issues.push(`节点 ${key} 的变体属性名不合法`);
        if (typeof value !== 'string' || !value.trim() || value.length > 128) {
          issues.push(`节点 ${key} 的变体属性 ${prop} 值不合法`);
        }
      }
    }
    if (!node.variantSetId) issues.push(`节点 ${key} 的 variantProps 只能用于变体集内的主组件`);
  }
  if (node.prototype !== undefined) {
    if (!isRecord(node.prototype)) {
      issues.push(`节点 ${key} 的 prototype 必须是对象`);
    } else {
      if (typeof node.prototype.targetId !== 'string' || !node.prototype.targetId) {
        issues.push(`节点 ${key} 的原型目标必须是非空画板 id`);
      }
      if (node.prototype.trigger !== undefined && node.prototype.trigger !== 'click') {
        issues.push(`节点 ${key} 的原型触发只支持 click`);
      }
    }
  }
  if (node.styleRefs !== undefined) {
    if (!isRecord(node.styleRefs)) {
      issues.push(`节点 ${key} 的 styleRefs 必须是对象`);
    } else {
      for (const [kind, id] of Object.entries(node.styleRefs)) {
        if (!STYLE_KINDS.has(kind as StyleKind) || typeof id !== 'string' || id.length === 0) {
          issues.push(`节点 ${key} 的 styleRefs 含非法样式引用`);
          break;
        }
      }
    }
  }
  if (node.variableBindings !== undefined) {
    if (!isRecord(node.variableBindings)) {
      issues.push(`节点 ${key} 的 variableBindings 必须是对象`);
    } else {
      const allowed = new Set(['fill', 'stroke', 'cornerRadius', 'strokeWidth', 'gap', 'padding', 'fontSize']);
      for (const [prop, id] of Object.entries(node.variableBindings)) {
        if (!allowed.has(prop) || typeof id !== 'string' || !id) {
          issues.push(`节点 ${key} 的 variableBindings 含非法绑定`);
          break;
        }
      }
    }
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

  const styles: Record<string, Style> = {};
  if (value.styles !== undefined) {
    if (!isRecord(value.styles)) {
      issues.push('场景 styles 必须是对象');
    } else {
      for (const [key, raw] of Object.entries(value.styles)) {
        if (RESERVED_KEYS.has(key)) {
          issues.push(`样式 id ${key} 是保留键`);
          continue;
        }
        if (!validateStyle(raw)) {
          issues.push(`样式 ${key} 结构非法`);
          continue;
        }
        if (raw.id !== key) issues.push(`样式 ${key} 的 id 与键名不一致`);
        styles[key] = raw;
      }
    }
  }

  const variables: Record<string, VariableCollection> = {};
  if (value.variables !== undefined) {
    if (!isRecord(value.variables)) {
      issues.push('场景 variables 必须是对象');
    } else {
      for (const [collectionId, raw] of Object.entries(value.variables)) {
        if (RESERVED_KEYS.has(collectionId)) {
          issues.push(`变量集合 id ${collectionId} 是保留键`);
          continue;
        }
        if (!isRecord(raw) || !Array.isArray(raw.modes) || !isRecord(raw.variables)) {
          issues.push(`变量集合 ${collectionId} 结构非法`);
          continue;
        }
        if (raw.id !== collectionId) issues.push(`变量集合 ${collectionId} 的 id 与键名不一致`);
        if (typeof raw.name !== 'string' || !raw.name.trim()) issues.push(`变量集合 ${collectionId} 缺少名称`);
        const modes: VariableMode[] = [];
        const modeIds = new Set<string>();
        for (const mode of raw.modes as unknown[]) {
          if (!isRecord(mode) || typeof mode.id !== 'string' || !mode.id || typeof mode.name !== 'string' || !mode.name.trim()) {
            issues.push(`变量集合 ${collectionId} 的 Mode 结构非法`);
            continue;
          }
          if (modeIds.has(mode.id)) issues.push(`变量集合 ${collectionId} 的 Mode id 重复`);
          modeIds.add(mode.id);
          modes.push({ id: mode.id, name: mode.name });
        }
        if (modes.length === 0) issues.push(`变量集合 ${collectionId} 至少需要一个 Mode`);
        if (modes.length > 16) issues.push(`变量集合 ${collectionId} 的 Mode 不能超过 16 个`);
        if (typeof raw.defaultModeId !== 'string' || !modeIds.has(raw.defaultModeId)) {
          issues.push(`变量集合 ${collectionId} 的 defaultModeId 无效`);
        }
        const collectionVars: Record<string, Variable> = {};
        for (const [varId, variable] of Object.entries(raw.variables as Record<string, unknown>)) {
          if (!isRecord(variable)) {
            issues.push(`变量 ${varId} 结构非法`);
            continue;
          }
          if (variable.id !== varId) issues.push(`变量 ${varId} 的 id 与键名不一致`);
          if (typeof variable.name !== 'string' || !variable.name.trim()) issues.push(`变量 ${varId} 缺少名称`);
          if (variable.collectionId !== collectionId) issues.push(`变量 ${varId} 的 collectionId 不一致`);
          if (!['color', 'number', 'string', 'boolean'].includes(String(variable.type))) {
            issues.push(`变量 ${varId} 的类型不受支持`);
          }
          if (!isRecord(variable.values)) {
            issues.push(`变量 ${varId} 的 values 必须是对象`);
            continue;
          }
          for (const mode of modes) {
            if (!(mode.id in variable.values)) {
              issues.push(`变量 ${varId} 缺少 Mode ${mode.name} 的值`);
            } else if (!validateVariableValue(String(variable.type), variable.values[mode.id])) {
              issues.push(`变量 ${varId} 在 Mode ${mode.name} 的值类型不匹配`);
            }
          }
          for (const modeId of Object.keys(variable.values)) {
            if (!modeIds.has(modeId)) issues.push(`变量 ${varId} 含未知 Mode ${modeId}`);
          }
          collectionVars[varId] = variable as unknown as Variable;
        }
        variables[collectionId] = {
          id: collectionId,
          name: String(raw.name ?? ''),
          modes,
          defaultModeId: String(raw.defaultModeId ?? ''),
          variables: collectionVars,
        };
      }
    }
  }

  const allVariables = new Map<string, Variable>();
  for (const collection of Object.values(variables)) {
    for (const variable of Object.values(collection.variables)) allVariables.set(variable.id, variable);
  }
  for (const variable of allVariables.values()) {
    if (variable.alias === undefined) continue;
    if (typeof variable.alias !== 'string' || !variable.alias) {
      issues.push(`变量 ${variable.id} 的 alias 必须是变量 id`);
      continue;
    }
    const target = allVariables.get(variable.alias);
    if (!target) {
      issues.push(`变量 ${variable.id} 引用了不存在的变量 ${variable.alias}`);
    } else if (target.type !== variable.type) {
      issues.push(`变量 ${variable.id} 只能引用同类型变量`);
    }
  }
  for (const variable of allVariables.values()) {
    if (!variable.alias) continue;
    const seen = new Set<string>();
    let cursor: Variable | undefined = variable;
    while (cursor?.alias) {
      if (seen.has(cursor.id)) {
        issues.push(`变量 ${variable.id} 的 alias 形成循环引用`);
        break;
      }
      seen.add(cursor.id);
      cursor = allVariables.get(cursor.alias);
    }
  }

  if (value.variableModes !== undefined) {
    if (!isRecord(value.variableModes)) {
      issues.push('场景 variableModes 必须是对象');
    } else {
      for (const [collectionId, modeId] of Object.entries(value.variableModes)) {
        const collection = variables[collectionId];
        if (!collection) issues.push(`variableModes 引用了不存在的集合 ${collectionId}`);
        else if (typeof modeId !== 'string' || !collection.modes.some((mode) => mode.id === modeId)) {
          issues.push(`variableModes 的集合 ${collectionId} 指向无效 Mode`);
        }
      }
    }
  }

  for (const key of nodeIds) {
    if (RESERVED_KEYS.has(key)) {
      issues.push(`节点 id ${key} 是保留键`);
      continue;
    }
    validateNode(nodes[key], key, assets, issues);
  }

  for (const id of nodeIds) {
    const refs = nodes[id]?.styleRefs;
    if (!refs) continue;
    for (const [kind, styleId] of Object.entries(refs)) {
      const style = styles[styleId as string];
      if (!style) {
        issues.push(`节点 ${id} 引用了不存在的样式 ${String(styleId)}`);
      } else if (style.kind !== kind) {
        issues.push(`节点 ${id} 的 ${kind} 样式引用类型不匹配`);
      }
    }
  }

  for (const id of nodeIds) {
    const bindings = nodes[id]?.variableBindings;
    if (!bindings) continue;
    for (const [prop, varId] of Object.entries(bindings)) {
      let variable: Variable | undefined;
      for (const collection of Object.values(variables)) {
        if (collection.variables[String(varId)]) {
          variable = collection.variables[String(varId)];
          break;
        }
      }
      if (!variable) {
        issues.push(`节点 ${id} 绑定了不存在的变量 ${String(varId)}`);
      } else if ((prop === 'fill' || prop === 'stroke') && variable.type !== 'color') {
        issues.push(`节点 ${id} 的${prop === 'fill' ? '填充' : '描边'}变量必须是颜色类型`);
      } else if (prop !== 'fill' && prop !== 'stroke' && variable.type !== 'number') {
        issues.push(`节点 ${id} 的${prop}变量必须是数值类型`);
      }
    }
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

  for (const id of nodeIds) {
    const node = nodes[id];
    if (!node?.variantSetId) continue;
    const set = nodes[node.variantSetId];
    if (!set) {
      issues.push(`变体 ${id} 引用了不存在的变体集 ${node.variantSetId}`);
      continue;
    }
    if (!set.isVariantSet || set.type !== 'frame') {
      issues.push(`变体 ${id} 的 variantSetId 必须指向变体集画板`);
    }
    if (node.parentId !== set.id) issues.push(`变体 ${id} 必须直接放在变体集 ${set.id} 内`);
  }

  for (const id of nodeIds) {
    const node = nodes[id];
    if (!node?.isVariantSet) continue;
    if (!isStringArray(node.children) || node.children.length === 0) {
      issues.push(`变体集 ${id} 必须至少包含一个变体`);
      continue;
    }
    let propNames: string[] | null = null;
    const combos = new Set<string>();
    for (const childId of node.children) {
      const child = nodes[childId];
      if (!child || child.type !== 'frame' || !child.isComponent || child.variantSetId !== id) {
        issues.push(`变体集 ${id} 的子层 ${childId} 必须是属于本集的变体主组件`);
        continue;
      }
      if (!child.variantProps) {
        issues.push(`变体 ${childId} 缺少 variantProps`);
        continue;
      }
      const names = Object.keys(child.variantProps).sort();
      if (!propNames) propNames = names;
      else if (names.join('|') !== propNames.join('|')) {
        issues.push(`变体集 ${id} 内的属性名不一致`);
      }
      const combo = names.map((name) => `${name}=${child.variantProps?.[name]}`).join('|');
      if (combos.has(combo)) issues.push(`变体集 ${id} 内存在重复变体组合 ${combo}`);
      combos.add(combo);
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
