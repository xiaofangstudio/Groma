import { describe, expect, it } from 'vitest';
import { dashForKind, dashKind, formatDash, parseDashInput } from './stroke';

describe('描边虚线编辑', () => {
  it('空数组是实线，预设数组分别识别为虚线与点线', () => {
    expect(dashKind([])).toBe('solid');
    expect(dashKind([8, 6])).toBe('dashed');
    expect(dashKind([2, 4])).toBe('dotted');
    expect(dashKind([14, 10])).toBe('custom');
  });

  it('切换预设会给出固定间距，自定义给出可编辑的初始间距', () => {
    expect(dashForKind('solid')).toEqual([]);
    expect(dashForKind('dashed')).toEqual([8, 6]);
    expect(dashForKind('dotted')).toEqual([2, 4]);
    expect(dashForKind('custom')).toEqual([8, 6]);
  });

  it('解析空格或逗号分隔的间距，非法值不覆盖原描边', () => {
    expect(parseDashInput('8, 6')).toEqual([8, 6]);
    expect(parseDashInput('14 10 4')).toEqual([14, 10, 4]);
    expect(parseDashInput('   ')).toEqual([]);
    expect(parseDashInput('8, 0')).toBeNull();
    expect(parseDashInput('8, -2')).toBeNull();
  });

  it('格式化保留小数且不产生多余空格', () => {
    expect(formatDash([14, 10])).toBe('14 10');
    expect(formatDash([])).toBe('');
  });
});
