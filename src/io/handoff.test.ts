import { describe, expect, it } from 'vitest';
import { handoffDescription, handoffLabel, handoffTargetForFormat } from './handoff';

describe('导出交接格式映射', () => {
  it('PNG 与 JPG 只去 Strata', () => {
    expect(handoffTargetForFormat('png')).toBe('strata');
    expect(handoffTargetForFormat('jpg')).toBe('strata');
  });

  it('SVG 只去 Vexa', () => {
    expect(handoffTargetForFormat('svg')).toBe('vexa');
    expect(handoffLabel('vexa')).toBe('Vexa');
    expect(handoffDescription('vexa')).toBe('SVG 矢量编辑');
  });
});
