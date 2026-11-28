import type { GromaDoc, Paint, Style } from '../core/types';

export interface StyleToken {
  id: string;
  name: string;
  kind: Style['kind'];
  variable: string;
  value: string;
}

function alpha(color: string, opacity: number): string {
  const full = /^#([0-9a-f]{6})$/i.exec(color.trim());
  const short = /^#([0-9a-f]{3})$/i.exec(color.trim());
  const hex = full ? full[1] : short ? short[1].split('').map((part) => part + part).join('') : null;
  if (!hex) return color;
  const a = Math.max(0, Math.min(1, opacity));
  return `rgba(${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)}, ${Math.round(a * 1000) / 1000})`;
}

function paintCss(paint: Paint, stacked = false): string {
  if (paint.type === 'solid') {
    const color = alpha(paint.color, paint.opacity);
    return stacked ? `linear-gradient(${color}, ${color})` : color;
  }
  const stops = paint.stops
    .map((stop) => `${alpha(stop.color, stop.opacity * paint.opacity)} ${Math.round(stop.offset * 1000) / 10}%`)
    .join(', ');
  if (paint.type === 'linear') {
    const angle = ((Math.atan2(paint.y2 - paint.y1, paint.x2 - paint.x1) * 180) / Math.PI + 90 + 360) % 360;
    return `linear-gradient(${Math.round(angle * 10) / 10}deg, ${stops})`;
  }
  return `radial-gradient(circle ${Math.round(paint.r * 100) / 100}px at ${Math.round(paint.cx * 100) / 100}px ${Math.round(paint.cy * 100) / 100}px, ${stops})`;
}

function styleValue(style: Style): string {
  if (style.kind === 'fill') {
    const layers = style.fills.map((paint) => paintCss(paint, style.fills.length > 1));
    return layers.join(', ');
  }
  if (style.kind === 'stroke') {
    const stroke = style.strokes[0];
    if (!stroke) return 'none';
    return `${Math.round(stroke.width * 100) / 100}px ${stroke.dash.length > 0 ? 'dashed' : 'solid'} ${alpha(stroke.color, stroke.opacity)}`;
  }
  if (style.kind === 'effect') {
    const effects = style.effects.filter((effect) => effect.visible);
    const parts: string[] = [];
    for (const effect of effects) {
      if (effect.type === 'layer-blur' || effect.type === 'background-blur') {
        parts.push(`blur(${Math.round(effect.blur * 100) / 100}px)`);
      } else {
        parts.push(`${Math.round(effect.x * 100) / 100}px ${Math.round(effect.y * 100) / 100}px ${Math.round(effect.blur * 100) / 100}px ${alpha(effect.color, effect.opacity)}`);
      }
    }
    return parts.length > 0 ? parts.join(', ') : 'none';
  }
  const text = style.textStyle;
  return `${text.fontWeight} ${text.fontSize}px/${text.lineHeight} ${text.fontFamily}`;
}

function slug(value: string): string {
  const clean = value
    .trim()
    .replace(/[^\w\u4e00-\u9fa5-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return clean || 'style';
}

/** 把文档里的命名样式整理成可复用的设计令牌；无样式时返回空数组。 */
export function styleTokens(doc: GromaDoc): StyleToken[] {
  return Object.values(doc.styles ?? {}).map((style, index) => ({
    id: style.id,
    name: style.name,
    kind: style.kind,
    variable: `--groma-${style.kind}-${index + 1}-${slug(style.name)}`,
    value: styleValue(style),
  }));
}

export function styleTokensCss(doc: GromaDoc): string {
  const tokens = styleTokens(doc);
  if (tokens.length === 0) return '/* Groma: 当前文档还没有命名样式 */\n:root {\n}\n';
  const lines = tokens.map((token) => `  /* ${token.kind} · ${token.name} */\n  ${token.variable}: ${token.value};`);
  return `/* Groma 设计令牌 · 由命名样式生成 */\n:root {\n${lines.join('\n')}\n}\n`;
}

export function styleTokensJson(doc: GromaDoc): string {
  return `${JSON.stringify(
    {
      generator: 'Groma',
      version: 1,
      tokens: styleTokens(doc).map(({ id, name, kind, variable, value }) => ({ id, name, kind, variable, value })),
    },
    null,
    2,
  )}\n`;
}
