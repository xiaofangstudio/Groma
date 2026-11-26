import type { Effect, SceneNode } from './types';

export const DEFAULT_DROP_SHADOW: Effect = {
  type: 'drop-shadow',
  x: 0,
  y: 10,
  blur: 18,
  color: '#221C00',
  opacity: 0.35,
  visible: true,
};

export const DEFAULT_LAYER_BLUR: Effect = {
  type: 'layer-blur',
  blur: 6,
  visible: true,
};

/** 只有可见效果参与渲染；旧工程没有 effects 时返回空表。 */
export function activeEffects(node: SceneNode): Effect[] {
  return (node.effects ?? []).filter((effect) => effect.visible);
}

/** 轨道外扩：投影偏移、模糊半径和节点自身的圆角/描边留一点余量。 */
export function effectsPadding(effects: Effect[]): number {
  let pad = 4;
  for (const effect of effects) {
    if (effect.type === 'drop-shadow') {
      pad = Math.max(pad, Math.abs(effect.x) + Math.abs(effect.y) + effect.blur * 2 + 8);
    } else {
      pad = Math.max(pad, effect.blur * 3 + 8);
    }
  }
  return pad;
}

export function effectsFilter(effects: Effect[]): string {
  return effects
    .filter((effect) => effect.type === 'layer-blur')
    .map((effect) => `blur(${Math.max(0, effect.blur)}px)`)
    .join(' ');
}

export function shadowColor(effect: Extract<Effect, { type: 'drop-shadow' }>): string {
  const alpha = Math.max(0, Math.min(1, effect.opacity));
  const match = /^#([0-9a-f]{6})$/i.exec(effect.color.trim());
  if (!match) return effect.color;
  const value = match[1];
  return `rgba(${parseInt(value.slice(0, 2), 16)}, ${parseInt(value.slice(2, 4), 16)}, ${parseInt(value.slice(4, 6), 16)}, ${alpha})`;
}
