import { describe, expect, it } from 'vitest';
import type { SceneNode } from './types';
import {
  countSharedPenVertices,
  insertPenAnchor,
  isSmoothPenAnchor,
  nearestOnPenPath,
  nodePathContours,
  pathAnchorsToWorld,
  pathContoursToWorld,
  penContoursGeometry,
  penGeometry,
  penPathData,
  removePenAnchor,
  removePenVertex,
  syncSharedPenVertex,
  togglePenAnchorType,
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

  it('多轮廓共享包围盒，pathData 含两个子路径', () => {
    const geometry = penContoursGeometry([
      {
        closed: true,
        anchors: [
          { x: 100, y: 80 },
          { x: 180, y: 80 },
          { x: 140, y: 140 },
        ],
      },
      {
        closed: false,
        anchors: [
          { x: 20, y: 160 },
          { x: 60, y: 180 },
        ],
      },
    ]);
    expect(geometry).not.toBeNull();
    expect(geometry?.x).toBe(20);
    expect(geometry?.y).toBe(80);
    expect(geometry?.w).toBe(160);
    expect(geometry?.h).toBe(100);
    expect(geometry?.contours).toHaveLength(2);
    expect(geometry?.contours[0].closed).toBe(true);
    expect(geometry?.contours[1].closed).toBe(false);
    expect(geometry?.pathData.match(/M /g)).toHaveLength(2);
    expect(geometry?.pathData).toContain('Z');
  });

  it('多轮廓节点缩放后两条轮廓都还原到世界坐标', () => {
    const node = {
      w: 200,
      h: 100,
      pathW: 100,
      pathH: 100,
      pathAnchors: [{ x: 0, y: 0, inX: 0, inY: 0, outX: 0, outY: 0 }],
      pathContours: [
        {
          closed: true,
          anchors: [
            { x: 10, y: 20, inX: 10, inY: 20, outX: 30, outY: 20 },
            { x: 90, y: 80, inX: 90, inY: 80, outX: 90, outY: 80 },
          ],
        },
        {
          closed: false,
          anchors: [
            { x: 20, y: 40, inX: 20, inY: 40, outX: 40, outY: 40 },
            { x: 60, y: 60, inX: 60, inY: 60, outX: 60, outY: 60 },
          ],
        },
      ],
    } as SceneNode;
    const contours = pathContoursToWorld(node, { x: 5, y: 7 });
    expect(contours).toHaveLength(2);
    expect(contours[0].anchors[0]).toMatchObject({ x: 25, y: 27, outX: 65, outY: 27 });
    expect(contours[1].anchors[1]).toMatchObject({ x: 125, y: 67 });
    expect(nodePathContours(node)).toHaveLength(2);
  });

  it('双击切换平滑点与角点，手柄共线等长', () => {
    const anchors = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 50, y: 100 },
    ];
    expect(isSmoothPenAnchor(anchors[1])).toBe(false);
    const smooth = togglePenAnchorType(anchors, true, 1);
    expect(smooth?.smooth).toBe(true);
    expect(smooth?.anchors[1].inX).toBeCloseTo(85.24, 2);
    expect(smooth?.anchors[1].inY).toBeCloseTo(-29.5, 1);
    expect(smooth?.anchors[1].outX).toBeCloseTo(114.76, 2);
    expect(smooth?.anchors[1].outY).toBeCloseTo(29.5, 1);
    expect(isSmoothPenAnchor(smooth!.anchors[1])).toBe(true);

    const corner = togglePenAnchorType(smooth!.anchors, true, 1);
    expect(corner?.smooth).toBe(false);
    expect(corner?.anchors[1]).toMatchObject({ x: 100, y: 0, inX: 100, inY: 0, outX: 100, outY: 0 });
  });

  it('共享 vertexId 同步位置与手柄，并贯穿几何与世界坐标', () => {
    const contours = [
      {
        closed: true,
        anchors: [
          { x: 10, y: 20, inX: 10, inY: 20, outX: 10, outY: 20, vertexId: 'shared' },
          { x: 80, y: 20, inX: 80, inY: 20, outX: 80, outY: 20, vertexId: 'a2' },
          { x: 80, y: 80, inX: 80, inY: 80, outX: 80, outY: 80, vertexId: 'a3' },
        ],
      },
      {
        closed: false,
        anchors: [
          { x: 10, y: 20, inX: 10, inY: 20, outX: 10, outY: 20, vertexId: 'shared' },
          { x: 20, y: 90, inX: 20, inY: 90, outX: 20, outY: 90, vertexId: 'b2' },
        ],
      },
    ];
    const moved = contours.map((contour) => ({
      closed: contour.closed,
      anchors: contour.anchors.map((anchor) => ({ ...anchor })),
    }));
    moved[0].anchors[0] = { x: 30, y: 40, inX: 25, inY: 40, outX: 35, outY: 40, vertexId: 'shared' };
    const synced = syncSharedPenVertex(moved, { contour: 0, index: 0 });
    expect(synced[1].anchors[0]).toMatchObject({ x: 30, y: 40, inX: 25, inY: 40, outX: 35, outY: 40 });
    expect(countSharedPenVertices(synced)).toBe(1);
    expect(penContoursGeometry(synced)?.contours[1].anchors[0]).toMatchObject({ vertexId: 'shared' });

    const node = {
      w: 200,
      h: 100,
      pathW: 100,
      pathH: 100,
      pathContours: synced,
    } as SceneNode;
    const world = pathContoursToWorld(node, { x: 5, y: 7 });
    expect(world[0].anchors[0].vertexId).toBe('shared');
    expect(world[1].anchors[0].vertexId).toBe('shared');
  });

  it('删除共享顶点会从所有轮廓移除，并在不足两点时收掉轮廓', () => {
    const contours = [
      {
        closed: true,
        anchors: [
          { x: 0, y: 0, vertexId: 'shared' },
          { x: 80, y: 0, vertexId: 'a2' },
          { x: 40, y: 60, vertexId: 'a3' },
        ],
      },
      {
        closed: false,
        anchors: [
          { x: 0, y: 0, vertexId: 'shared' },
          { x: 20, y: 80, vertexId: 'b2' },
        ],
      },
    ];
    const next = removePenVertex(contours, { contour: 0, index: 0 });
    expect(next).toHaveLength(1);
    expect(next?.[0].anchors.map((anchor) => anchor.vertexId)).toEqual(['a2', 'a3']);
    expect(removePenVertex([{ closed: false, anchors: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }], { contour: 0, index: 1 })).toBeNull();
  });
});
