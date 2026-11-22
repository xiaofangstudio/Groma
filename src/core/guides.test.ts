import { describe, expect, it } from 'vitest';
import { guideScreenPosition, hitTestGuide } from './guides';
import type { Guide } from './types';
import type { Viewport } from './viewport';

const viewport: Viewport = { x: 40, y: 80, scale: 0.5 };

describe('手动参考线命中', () => {
  it('横向参考线用内容坐标命中，不会多算标尺高度', () => {
    const guides: Guide[] = [{ axis: 'y', position: 200 }];
    expect(guideScreenPosition(guides[0], viewport)).toBe(180);
    expect(hitTestGuide(guides, { x: 300, y: 180 }, viewport)?.index).toBe(0);
    expect(hitTestGuide(guides, { x: 300, y: 200 }, viewport)).toBeNull();
  });

  it('纵向参考线同样命中真实线位置', () => {
    const guides: Guide[] = [{ axis: 'x', position: 180 }];
    expect(guideScreenPosition(guides[0], viewport)).toBe(130);
    expect(hitTestGuide(guides, { x: 130, y: 300 }, viewport)?.index).toBe(0);
    expect(hitTestGuide(guides, { x: 150, y: 300 }, viewport)).toBeNull();
  });

  it('多条参考线取第一根命中的', () => {
    const guides: Guide[] = [
      { axis: 'x', position: 100 },
      { axis: 'x', position: 180 },
    ];
    expect(hitTestGuide(guides, { x: 131, y: 300 }, viewport)?.index).toBe(1);
  });
});
