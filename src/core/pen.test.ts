import { describe, expect, it } from 'vitest';
import type { SceneNode } from './types';
import {
  insertPenAnchor,
  nearestOnPenPath,
  nodePathContours,
  pathAnchorsToWorld,
  pathContoursToWorld,
  penContoursGeometry,
  penGeometry,
  penPathData,
  removePenAnchor,
} from './pen';

describe('钢笔路径几何', () => {
  it('角点生成直线段并对齐到包围盒原点', () => {
    const path = penGeometry(
      [
        { x: 100, y: 80 },
        { x: 180, y: 80 },
        { x: 180, y: 140 },
      ],
      false,
    );
    expect(path).not.toBeNull();
    expect(path?.x).toBe(100);
    expect(path?.y).toBe(80);
    expect(path?.w).toBe(80);
    expect(path?.h).toBe(60);
    expect(path?.pathData).toBe('M 0 0 L 80 0 L 80 60');
    expect(path?.closed).toBe(false);
    expect(path?.anchors.map((anchor) => [anchor.x, anchor.y])).toEqual([
      [0, 0],
      [80, 0],
      [80, 60],
    ]);
  });

  it('拖动手柄生成三次贝塞尔，并把控制点计入包围盒', () => {
    const path = penGeometry(
      [
        { x: 100, y: 100, outX: 120, outY: 60 },
        { x: 200, y: 100, inX: 180, inY: 140 },
      ],
      false,
    );
    expect(path).not.toBeNull();
    expect(path?.y).toBe(60);
    expect(path?.h).toBe(80);
    expect(path?.pathData).toContain('M 0 40 C 20 0 80 80 100 40');
    expect(path?.anchors[0].outX).toBe(20);
    expect(path?.anchors[0].outY).toBe(0);
  });

  it('闭合路径补最后一段并加 Z，少于三个锚点不闭合', () => {
    const closed = penGeometry(
      [
        { x: 0, y: 0 },
        { x: 120, y: 0 },
        { x: 60, y: 90 },
      ],
      true,
    );
    expect(closed?.pathData).toBe('M 0 0 L 120 0 L 60 90 L 0 0 Z');
    expect(closed?.closed).toBe(true);

    expect(penGeometry([{ x: 0, y: 0 }, { x: 10, y: 0 }], true)?.closed).toBe(false);
  });

  it('少于两个锚点不生成节点，空锚点返回空路径', () => {
    expect(penGeometry([], false)).toBeNull();
    expect(penGeometry([{ x: 8, y: 8 }], false)).toBeNull();
    expect(penPathData([])).toBe('');
  });

  it('在线段上命中最近点并插入锚点，插入后不改变原直线', () => {
    const anchors = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    const hit = nearestOnPenPath(anchors, false, { x: 50, y: 8 });
    expect(hit?.segment).toBe(0);
    expect(hit?.t).toBeCloseTo(0.5, 1);
    expect(hit?.distance).toBeCloseTo(8, 0);

    const next = insertPenAnchor(anchors, false, 0, 0.5);
    expect(next).toHaveLength(4);
    expect(next[1]).toMatchObject({ x: 50, y: 0, inX: 50, inY: 0, outX: 50, outY: 0 });
    expect(penPathData(next, false)).toBe('M 0 0 L 50 0 L 100 0 L 100 100');
  });

  it('贝塞尔段切分保留曲线形状，删点最少保留两个锚点', () => {
    const anchors = [
      { x: 0, y: 0, outX: 100, outY: -100 },
      { x: 200, y: 0, inX: 100, inY: 100 },
    ];
    const next = insertPenAnchor(anchors, false, 0, 0.5);
    expect(next).toHaveLength(3);
    expect(next[0]).toMatchObject({ x: 0, y: 0, outX: 50, outY: -50 });
    expect(next[1]).toMatchObject({ x: 100, y: 0, inX: 75, inY: -25, outX: 125, outY: 25 });
    expect(next[2]).toMatchObject({ x: 200, y: 0, inX: 150, inY: 50 });

    expect(removePenAnchor(next, 1)).toHaveLength(2);
    expect(removePenAnchor(next.slice(0, 2), 0)).toBeNull();
  });

  it('节点缩放后把局部锚点还原到世界坐标', () => {
    const node = {
      w: 200,
      h: 100,
      pathW: 100,
      pathH: 100,
      pathAnchors: [
        { x: 10, y: 20, inX: 10, inY: 20, outX: 30, outY: 20 },
        { x: 90, y: 80, inX: 90, inY: 80, outX: 90, outY: 80 },
      ],
    } as SceneNode;
    const world = pathAnchorsToWorld(node, { x: 5, y: 7 });
    expect(world[0]).toMatchObject({ x: 25, y: 27, outX: 65, outY: 27 });
    expect(world[1].x).toBe(185);
    expect(world[1].y).toBe(87);
  });
});
