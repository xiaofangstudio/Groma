import type { Effect, Paint, SceneNode, Stroke, Style, StyleKind, TextStyle } from './types';
import type { NodePatch } from './commands';

export const STYLE_KINDS: StyleKind[] = ['fill', 'stroke', 'effect', 'text'];

export const STYLE_KIND_LABEL: Record<StyleKind, string> = {
  fill: '填充',
  stroke: '描边',
  effect: '效果',
  text: '文本',
};

const TEXT_STYLE_KEYS: Array<keyof SceneNode> = [
  'fontSize',
  'fontWeight',
  'fontFamily',
  'italic',
  'align',
  'lineHeight',
  'letterSpacing',
  'paragraphSpacing',
  'listStyle',
];

function clonePaint(paint: Paint): Paint {
  return paint.type === 'solid' ? { ...paint } : { ...paint, stops: paint.stops.map((stop) => ({ ...stop })) };
}

function cloneStroke(stroke: Stroke): Stroke {
  return { ...stroke, dash: [...stroke.dash] };
}

function cloneEffect(effect: Effect): Effect {
  return { ...effect } as Effect;
}

export function textStyleOf(node: SceneNode): TextStyle {
  return {
    fontSize: node.fontSize ?? 24,
    fontWeight: node.fontWeight ?? 500,
    fontFamily: node.fontFamily ?? 'Segoe UI, Microsoft YaHei UI, "Microsoft YaHei", sans-serif',
    italic: Boolean(node.italic),
    align: node.align ?? 'left',
    lineHeight: node.lineHeight ?? 1.3,
    letterSpacing: node.letterSpacing ?? 0,
    paragraphSpacing: node.paragraphSpacing ?? 0,
    listStyle: node.listStyle ?? 'none',
  };
}

export function canCreateStyle(kind: StyleKind, node: SceneNode): boolean {
  if (kind === 'fill') return node.fills.length > 0;
  if (kind === 'stroke') return Boolean(node.strokes?.length);
  if (kind === 'effect') return Boolean(node.effects?.length);
  return node.type === 'text';
}

export function styleFromNode(kind: StyleKind, id: string, name: string, node: SceneNode): Style | null {
  if (!canCreateStyle(kind, node)) return null;
  if (kind === 'fill') return { id, name, kind, fills: node.fills.map(clonePaint) };
  if (kind === 'stroke') return { id, name, kind, strokes: (node.strokes ?? []).map(cloneStroke) };
  if (kind === 'effect') return { id, name, kind, effects: (node.effects ?? []).map(cloneEffect) };
  return { id, name, kind, textStyle: textStyleOf(node) };
}

/** 套用样式时写进节点的完整补丁，包含绑定。 */
export function styleApplyPatch(style: Style, node: SceneNode): NodePatch {
  const refs = { ...(node.styleRefs ?? {}), [style.kind]: style.id };
  if (style.kind === 'fill') return { fills: style.fills.map(clonePaint), styleRefs: refs };
  if (style.kind === 'stroke') return { strokes: style.strokes.map(cloneStroke), styleRefs: refs };
  if (style.kind === 'effect') return { effects: style.effects.map(cloneEffect), styleRefs: refs };
  return { ...style.textStyle, styleRefs: refs };
}

/** 把当前节点的值写回已有样式，保持绑定。 */
export function styleValuesPatch(style: Style, node: SceneNode): NodePatch {
  if (style.kind === 'fill') return { fills: node.fills.map(clonePaint) };
  if (style.kind === 'stroke') return { strokes: (node.strokes ?? []).map(cloneStroke) };
  if (style.kind === 'effect') return { effects: (node.effects ?? []).map(cloneEffect) };
  return { ...textStyleOf(node) };
}

export function detachedStyleKinds(patch: NodePatch): StyleKind[] {
  const kinds: StyleKind[] = [];
  if ('fills' in patch) kinds.push('fill');
  if ('strokes' in patch) kinds.push('stroke');
  if ('effects' in patch) kinds.push('effect');
  if (TEXT_STYLE_KEYS.some((key) => key in patch)) kinds.push('text');
  return kinds;
}

export function withoutStyleRefs(node: SceneNode, kinds: StyleKind[]): SceneNode['styleRefs'] {
  if (!node.styleRefs || kinds.length === 0) return node.styleRefs;
  const next = { ...node.styleRefs };
  for (const kind of kinds) delete next[kind];
  return Object.keys(next).length > 0 ? next : undefined;
}

export function styleName(kind: StyleKind, index: number): string {
  return `${STYLE_KIND_LABEL[kind]}样式 ${index + 1}`;
}

/** 当前节点值是否仍和绑定样式一致；不一致时提示“已偏离”。 */
export function styleMatchesNode(style: Style, node: SceneNode): boolean {
  if (style.kind === 'fill') return JSON.stringify(style.fills) === JSON.stringify(node.fills);
  if (style.kind === 'stroke') return JSON.stringify(style.strokes) === JSON.stringify(node.strokes ?? []);
  if (style.kind === 'effect') return JSON.stringify(style.effects) === JSON.stringify(node.effects ?? []);
  return JSON.stringify(style.textStyle) === JSON.stringify(textStyleOf(node));
}

