import { describe, expect, it } from 'vitest';
import { cornerPathData, cornerRadiiOf, scaledCornerRadii } from './corners';

describe('四角独立圆角', () => {
  it('缺省回退到统一圆角，四角顺序固定', () => {
    expect(cornerRadiiOf({ cornerRadius: 12 })).toEqual([12, 12, 12, 12]);
    expect(cornerRadiiOf({ cornerRadius: 12, cornerRadii: [8, 0, 16, 4] })).toEqual([8, 0, 16, 4]);
  });

  it('缩放到屏幕坐标后按短边限制单角半径', () => {
    expect(scaledCornerRadii({ cornerRadius: 0, cornerRadii: [20, 0, 40, 8] }, 0.5, 100, 60)).toEqual([10, 0, 20, 4]);
    expect(scaledCornerRadii({ cornerRadius: 0, cornerRadii: [200, 0, 0, 0] }, 1, 100, 60)).toEqual([30, 0, 0, 0]);
  });

  it('输出顺时针圆角路径，零角走直线', () => {
    expect(cornerPathData(20, 30, 80, 60, [30, 0, 18, 6])).toBe(
      'M 50 30 L 100 30 L 100 30 L 100 72 A 18 18 0 0 1 82 90 L 26 90 A 6 6 0 0 1 20 84 L 20 60 A 30 30 0 0 1 50 30 Z',
    );
    expect(cornerPathData(0, 0, 100, 100, [0, 0, 0, 0])).toBe(
      'M 0 0 L 100 0 L 100 0 L 100 100 L 100 100 L 0 100 L 0 100 L 0 0 L 0 0 Z',
    );
  });
});
