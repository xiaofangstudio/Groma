import { describe, expect, it } from 'vitest';
import { createDoc } from '../core/doc';
import { styleTokensCss, styleTokensJson } from './tokens';

describe('设计令牌导出', () => {
  it('把填充样式导出为 CSS 变量，并保留多填充顺序', () => {
    const doc = createDoc('令测试', 400, 300);
    doc.styles = {
      'style-brand': {
        id: 'style-brand',
        name: '品牌 / 主色',
        kind: 'fill',
        fills: [
          { type: 'linear', color: '#0EA5E9', opacity: 1, x1: 0, y1: 0, x2: 100, y2: 0, stops: [{ offset: 0, color: '#0EA5E9', opacity: 1 }, { offset: 1, color: '#6366F1', opacity: 1 }] },
          { type: 'solid', color: '#FFFFFF', opacity: 0.18 },
        ],
      },
    };
    const css = styleTokensCss(doc);
    expect(css).toContain('--groma-fill-1-品牌-主色');
    expect(css).toContain('linear-gradient(90deg');
    expect(css).toContain('rgba(255, 255, 255, 0.18)');
    expect(css.startsWith('/* Groma 设计令牌')).toBe(true);
  });

  it('导出 JSON 令牌清单与样式一一对应', () => {
    const doc = createDoc('令测试', 400, 300);
    doc.styles = {
      'style-text': {
        id: 'style-text',
        name: '标题',
        kind: 'text',
        textStyle: {
          fontSize: 32,
          fontWeight: 700,
          fontFamily: 'Segoe UI, sans-serif',
          italic: false,
          align: 'left',
          lineHeight: 1.2,
          letterSpacing: 0,
          paragraphSpacing: 0,
          listStyle: 'none',
        },
      },
    };
    const parsed = JSON.parse(styleTokensJson(doc)) as { tokens: Array<{ variable: string; value: string }> };
    expect(parsed.tokens).toHaveLength(1);
    expect(parsed.tokens[0].variable).toBe('--groma-text-1-标题');
    expect(parsed.tokens[0].value).toBe('700 32px/1.2 Segoe UI, sans-serif');
  });
});
