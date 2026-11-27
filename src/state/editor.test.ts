import { beforeEach, describe, expect, it } from 'vitest';
import { editor, getState } from './editor';

function rootId(): string {
  const s = getState();
  return s.doc.nodes[s.doc.pages[0].rootId].id;
}

describe('editor 命令与历史', () => {
  beforeEach(() => {
    editor.newDoc('测试工程');
  });

  it('新增节点、撤销、重做', () => {
    const id = editor.addNode({ type: 'rect', parentId: rootId(), x: 10, y: 20, w: 100, h: 50 });
    expect(getState().doc.nodes[id]).toBeTruthy();
    expect(getState().selectedId).toBe(id);

    editor.undo();
    expect(getState().doc.nodes[id]).toBeUndefined();

    editor.redo();
    expect(getState().doc.nodes[id]).toBeTruthy();
    expect(getState().doc.nodes[id].x).toBe(10);
  });

  it('布尔并集落成单个路径节点，并一步撤销/重做', () => {
    const a = editor.addNode({ type: 'rect', parentId: rootId(), x: 0, y: 0, w: 100, h: 100 });
    const b = editor.addNode({ type: 'rect', parentId: rootId(), x: 50, y: 0, w: 100, h: 100 });
    editor.select(a);
    editor.select(b, true);
    expect(editor.booleanSelected('union')).toBe(true);
    const resultId = getState().selectedId;
    expect(resultId).toBeTruthy();
    expect(getState().doc.nodes[a]).toBeUndefined();
    expect(getState().doc.nodes[b]).toBeUndefined();
    expect(getState().doc.nodes[resultId!].pathContours?.length).toBe(1);

    editor.undo();
    expect(getState().doc.nodes[a]).toBeTruthy();
    expect(getState().doc.nodes[b]).toBeTruthy();
    expect(getState().doc.nodes[resultId!]).toBeUndefined();

    editor.redo();
    expect(getState().doc.nodes[a]).toBeUndefined();
    expect(getState().doc.nodes[resultId!]).toBeTruthy();
  });

  it('三对象布尔合并为一条历史，一步撤销恢复全部源对象', () => {
    const a = editor.addNode({ type: 'rect', parentId: rootId(), x: 0, y: 0, w: 100, h: 100 });
    const b = editor.addNode({ type: 'rect', parentId: rootId(), x: 50, y: 0, w: 100, h: 100 });
    const c = editor.addNode({ type: 'rect', parentId: rootId(), x: 75, y: 0, w: 100, h: 100 });
    editor.select(a);
    editor.select(b, true);
    editor.select(c, true);
    expect(getState().selectedIds).toHaveLength(3);
    expect(editor.booleanSelected('union')).toBe(true);
    const resultId = getState().selectedId;
    expect(getState().doc.nodes[a]).toBeUndefined();
    expect(getState().doc.nodes[b]).toBeUndefined();
    expect(getState().doc.nodes[c]).toBeUndefined();
    expect(getState().doc.nodes[resultId!].pathContours?.length).toBe(1);

    editor.undo();
    expect(getState().doc.nodes[a]).toBeTruthy();
    expect(getState().doc.nodes[b]).toBeTruthy();
    expect(getState().doc.nodes[c]).toBeTruthy();
    expect(getState().doc.nodes[resultId!]).toBeUndefined();

    editor.redo();
    expect(getState().doc.nodes[a]).toBeUndefined();
    expect(getState().doc.nodes[b]).toBeUndefined();
    expect(getState().doc.nodes[c]).toBeUndefined();
    expect(getState().doc.nodes[resultId!]).toBeTruthy();
  });

  it('分割生成多个区域并一步撤销全部恢复', () => {
    const a = editor.addNode({ type: 'rect', parentId: rootId(), x: 0, y: 0, w: 100, h: 100 });
    const b = editor.addNode({ type: 'rect', parentId: rootId(), x: 50, y: 0, w: 100, h: 100 });
    editor.select(a);
    editor.select(b, true);
    expect(editor.vectorSelected('divide')).toBe(true);
    const resultIds = getState().selectedIds;
    expect(resultIds).toHaveLength(3);
    expect(getState().doc.nodes[a]).toBeUndefined();
    expect(getState().doc.nodes[b]).toBeUndefined();
    expect(resultIds.every((id) => getState().doc.nodes[id]?.name.startsWith('分割 '))).toBe(true);

    editor.undo();
    expect(getState().doc.nodes[a]).toBeTruthy();
    expect(getState().doc.nodes[b]).toBeTruthy();
    expect(resultIds.every((id) => !getState().doc.nodes[id])).toBe(true);

    editor.redo();
    expect(getState().doc.nodes[a]).toBeUndefined();
    expect(resultIds.every((id) => getState().doc.nodes[id])).toBe(true);
  });

  it('描边转形状清空源描边，并一步撤销恢复', () => {
    const a = editor.addNode({ type: 'rect', parentId: rootId(), x: 0, y: 0, w: 100, h: 100 });
    editor.applyPatch(a, {
      strokes: [{ color: '#FF0000', opacity: 1, width: 10, dash: [], cap: 'butt', join: 'miter' }],
    });
    editor.select(a);
    expect(editor.vectorSelected('outline')).toBe(true);
    const resultId = getState().selectedId;
    expect(getState().doc.nodes[a].strokes).toHaveLength(0);
    expect(getState().doc.nodes[resultId!]?.fills?.[0]).toMatchObject({ type: 'solid', color: '#FF0000' });

    editor.undo();
    expect(getState().doc.nodes[a].strokes?.[0]?.width).toBe(10);
    expect(getState().doc.nodes[resultId!]).toBeUndefined();

    editor.redo();
    expect(getState().doc.nodes[a].strokes).toHaveLength(0);
    expect(getState().doc.nodes[resultId!]).toBeTruthy();
  });

  it('直线以 path 节点落盘，默认无填充并带描边', () => {
    const id = editor.addNode({
      type: 'path',
      parentId: rootId(),
      x: 40,
      y: 60,
      w: 160,
      h: 80,
      pathData: 'M 0 0 L 160 80',
      pathW: 160,
      pathH: 80,
    });
    const node = getState().doc.nodes[id];
    expect(node.type).toBe('path');
    expect(node.pathData).toBe('M 0 0 L 160 80');
    expect(node.pathW).toBe(160);
    expect(node.pathH).toBe(80);
    expect(node.fills).toEqual([]);
    expect(node.strokes?.[0]?.width).toBe(2);
    expect(node.strokes?.[0]?.color).toBe('#221C00');

    editor.undo();
    expect(getState().doc.nodes[id]).toBeUndefined();
  });

  it('多边形与星形以参数化 path 落盘，改边数可撤销', () => {
    const polygon = editor.addNode({
      type: 'path',
      parentId: rootId(),
      x: 40,
      y: 60,
      w: 160,
      h: 160,
      pathData: 'M 80 0 L 160 80 L 80 160 L 0 80 Z',
      shapeKind: 'polygon',
      shapeSides: 4,
      fill: '#D9D9D9',
      strokes: [],
    });
    const polyNode = getState().doc.nodes[polygon];
    expect(polyNode.name).toBe('多边形 1');
    expect(polyNode.shapeKind).toBe('polygon');
    expect(polyNode.shapeSides).toBe(4);
    expect(polyNode.fills).toEqual([{ type: 'solid', color: '#D9D9D9', opacity: 1 }]);
    expect(editor.setShapeParams(polygon, { sides: 6 })).toBe(true);
    expect(getState().doc.nodes[polygon].shapeSides).toBe(6);
    expect(getState().doc.nodes[polygon].pathData).toContain(' L ');

    editor.undo();
    expect(getState().doc.nodes[polygon].shapeSides).toBe(4);

    const star = editor.addNode({
      type: 'path',
      parentId: rootId(),
      x: 220,
      y: 60,
      w: 160,
      h: 160,
      pathData: 'M 0 0 L 160 160 Z',
      shapeKind: 'star',
      shapeSides: 5,
      shapeInnerRatio: 0.5,
      fill: '#D9D9D9',
      strokes: [],
    });
    expect(getState().doc.nodes[star].name).toBe('星形 1');
    expect(getState().doc.nodes[star].shapeInnerRatio).toBe(0.5);
  });

  it('箭头以线身加三角头落盘，默认无填充与 2px 描边', () => {
    const arrow = editor.addNode({
      type: 'path',
      parentId: rootId(),
      x: 20,
      y: 30,
      w: 160,
      h: 42,
      pathData: 'M 0 21 L 160 21',
      pathW: 160,
      pathH: 42,
      shapeKind: 'arrow',
      arrowHeadData: 'M 145 1 L 160 21 L 145 41 Z',
    });
    const node = getState().doc.nodes[arrow];
    expect(node.name).toBe('箭头 1');
    expect(node.shapeKind).toBe('arrow');
    expect(node.shapeSides).toBeUndefined();
    expect(node.arrowHeadData).toContain('Z');
    expect(node.fills).toEqual([]);
    expect(node.strokes?.[0].color).toBe('#221C00');
    expect(node.strokes?.[0].width).toBe(2);
    expect(editor.setShapeParams(arrow, { sides: 8 })).toBe(false);
  });

  it('切片以只标注节点落盘，无填充且不改画板结构', () => {
    const frame = editor.addNode({ type: 'frame', parentId: rootId(), x: 0, y: 0, w: 400, h: 300 });
    const slice = editor.addNode({ type: 'slice', parentId: frame, x: 120, y: 80, w: 160, h: 100 });
    const node = getState().doc.nodes[slice];
    expect(node.type).toBe('slice');
    expect(node.name).toBe('切片 1');
    expect(node.fills).toEqual([]);
    expect(node.children).toEqual([]);
    expect(node.clipContent).toBe(false);

    editor.undo();
    expect(getState().doc.nodes[slice]).toBeUndefined();
    expect(getState().doc.nodes[frame].children).toEqual([]);
  });

  it('导入图片会同时登记资产、选中节点并可撤销重做', () => {
    const asset = {
      id: 'asset-1',
      name: '照片.png',
      mime: 'image/png',
      file: 'assets/照片.png',
      w: 640,
      h: 480,
      bytes: 1200,
    };
    const id = editor.insertImage(asset);
    const s = getState();
    expect(s.doc.nodes[id].type).toBe('image');
    expect(s.doc.nodes[id].assetId).toBe('asset-1');
    expect(s.doc.assets?.['asset-1']).toEqual(asset);
    expect(s.selectedId).toBe(id);

    editor.undo();
    expect(getState().doc.nodes[id]).toBeUndefined();
    expect(getState().doc.assets?.['asset-1']).toBeTruthy();

    editor.redo();
    expect(getState().doc.nodes[id].assetId).toBe('asset-1');
  });

  it('恢复原比例按资产宽高修正节点高度', () => {
    const asset = {
      id: 'asset-2',
      name: '宽图.png',
      mime: 'image/png',
      file: 'assets/宽图.png',
      w: 800,
      h: 400,
      bytes: 1000,
    };
    const id = editor.insertImage(asset, { w: 400, h: 300 });
    expect(editor.fitImageRatio(id)).toBe(true);
    expect(getState().doc.nodes[id].h).toBe(200);
  });

  it('文本对齐、行高与斜体可写入并可撤销', () => {
    const id = editor.addNode({ type: 'text', parentId: rootId(), x: 12, y: 18, w: 240, h: 44 });
    editor.applyPatch(id, { align: 'center', lineHeight: 1.6, italic: true });
    const styled = getState().doc.nodes[id];
    expect(styled.align).toBe('center');
    expect(styled.lineHeight).toBe(1.6);
    expect(styled.italic).toBe(true);

    editor.undo();
    const base = getState().doc.nodes[id];
    expect(base.align).toBeUndefined();
    expect(base.lineHeight).toBeUndefined();
    expect(base.italic).toBeUndefined();
  });

  it('替换图片保留位置尺寸、登记新资产并可撤销', () => {
    const first = {
      id: 'asset-4',
      name: '旧图.png',
      mime: 'image/png',
      file: 'assets/旧图.png',
      w: 640,
      h: 480,
      bytes: 1000,
    };
    const next = {
      id: 'asset-5',
      name: '新图.png',
      mime: 'image/png',
      file: 'assets/新图.png',
      w: 300,
      h: 200,
      bytes: 900,
    };
    const id = editor.insertImage(first, { w: 320, h: 240 });
    const before = getState().doc.nodes[id];
    expect(editor.replaceImageAsset(id, next)).toBe(true);
    const s = getState();
    expect(s.doc.nodes[id].assetId).toBe('asset-5');
    expect(s.doc.nodes[id].name).toBe('新图.png');
    expect(s.doc.nodes[id].w).toBe(before.w);
    expect(s.doc.nodes[id].h).toBe(before.h);
    expect(s.doc.assets?.['asset-5']).toEqual(next);
    expect(s.doc.assets?.['asset-4']).toBeTruthy();

    editor.undo();
    expect(getState().doc.nodes[id].assetId).toBe('asset-4');
  });

  it('图片默认落入视口中心画板，保证画板导出带上图片', () => {
    editor.setCanvasSize(1440, 900);
    const page = getState().doc.pages[0];
    const frameId = getState().doc.nodes[page.rootId].children[0];
    const asset = {
      id: 'asset-3',
      name: '居中.png',
      mime: 'image/png',
      file: 'assets/居中.png',
      w: 320,
      h: 200,
      bytes: 800,
    };
    const id = editor.insertImage(asset);
    expect(getState().doc.nodes[id].parentId).toBe(frameId);
  });

  it('区块节点可容纳画板，删除整块可撤销', () => {
    const section = editor.addNode({ type: 'section', parentId: rootId(), x: 40, y: 60, w: 1200, h: 800 });
    const frame = editor.addNode({ type: 'frame', parentId: section, x: 80, y: 80, w: 480, h: 320 });
    const s = getState();
    expect(s.doc.nodes[section].type).toBe('section');
    expect(s.doc.nodes[section].fills).toEqual([]);
    expect(s.doc.nodes[section].children).toContain(frame);
    expect(s.doc.nodes[frame].parentId).toBe(section);

    editor.select(section);
    editor.deleteSelected();
    expect(getState().doc.nodes[section]).toBeUndefined();
    expect(getState().doc.nodes[frame]).toBeUndefined();

    editor.undo();
    expect(getState().doc.nodes[section]).toBeTruthy();
    expect(getState().doc.nodes[frame].parentId).toBe(section);
  });

  it('拖动事务只产生一条撤销记录', () => {
    const id = editor.addNode({ type: 'rect', parentId: rootId(), x: 0, y: 0, w: 100, h: 100 });
    const beforeCount = getState().past.length;

    editor.beginTransaction(id);
    editor.updateSilent(id, { x: 10 });
    editor.updateSilent(id, { x: 30 });
    editor.endTransaction();

    expect(getState().doc.nodes[id].x).toBe(30);
    expect(getState().past.length).toBe(beforeCount + 1);

    editor.undo();
    expect(getState().doc.nodes[id].x).toBe(0);
  });

  it('删除节点及子树后可以撤销恢复', () => {
    const frame = editor.addNode({ type: 'frame', parentId: rootId(), x: 0, y: 0, w: 400, h: 300 });
    const child = editor.addNode({ type: 'rect', parentId: frame, x: 20, y: 20, w: 80, h: 60 });
    editor.select(frame);

    editor.deleteSelected();
    expect(getState().doc.nodes[frame]).toBeUndefined();
    expect(getState().doc.nodes[child]).toBeUndefined();

    editor.undo();
    expect(getState().doc.nodes[frame]).toBeTruthy();
    expect(getState().doc.nodes[child]).toBeTruthy();
    expect(getState().doc.nodes[child].parentId).toBe(frame);
  });

  it('属性补丁可撤销可重做', () => {
    const id = editor.addNode({ type: 'rect', parentId: rootId(), x: 0, y: 0, w: 100, h: 100 });
    editor.applyPatch(id, { cornerRadius: 12, opacity: 0.5 });
    expect(getState().doc.nodes[id].cornerRadius).toBe(12);

    editor.undo();
    expect(getState().doc.nodes[id].cornerRadius).toBe(0);
    expect(getState().doc.nodes[id].opacity).toBe(1);

    editor.redo();
    expect(getState().doc.nodes[id].cornerRadius).toBe(12);
  });

  it('四角独立圆角补丁与统一圆角可撤销', () => {
    const id = editor.addNode({ type: 'rect', parentId: rootId(), x: 0, y: 0, w: 100, h: 100 });
    editor.applyPatch(id, { cornerRadii: [20, 0, 40, 8], cornerRadius: 40 });
    expect(getState().doc.nodes[id].cornerRadii).toEqual([20, 0, 40, 8]);

    editor.applyPatch(id, { cornerRadius: 12, cornerRadii: undefined });
    expect(getState().doc.nodes[id].cornerRadii).toBeUndefined();
    expect(getState().doc.nodes[id].cornerRadius).toBe(12);

    editor.undo();
    expect(getState().doc.nodes[id].cornerRadii).toEqual([20, 0, 40, 8]);
    editor.undo();
    expect(getState().doc.nodes[id].cornerRadii).toBeUndefined();
  });

  it('复制子树后可以整组撤销与重做', () => {
    const frame = editor.addNode({ type: 'frame', parentId: rootId(), x: 40, y: 60, w: 400, h: 300 });
    const child = editor.addNode({ type: 'rect', parentId: frame, x: 20, y: 20, w: 80, h: 60 });
    editor.select(frame);
    const nodeCount = Object.keys(getState().doc.nodes).length;

    editor.duplicateSelected();
    const cloneId = getState().selectedId as string;
    const clone = getState().doc.nodes[cloneId];
    expect(clone).toBeTruthy();
    expect(clone.parentId).toBe(rootId());
    expect(clone.x).toBe(52);
    expect(clone.y).toBe(72);
    expect(clone.children.length).toBe(1);
    expect(Object.keys(getState().doc.nodes).length).toBe(nodeCount + 2);
    const cloneChild = getState().doc.nodes[clone.children[0]];
    expect(cloneChild).toBeTruthy();
    expect(cloneChild.parentId).toBe(cloneId);

    editor.undo();
    expect(getState().doc.nodes[cloneId]).toBeUndefined();
    expect(getState().doc.nodes[clone.children[0]]).toBeUndefined();

    editor.redo();
    expect(getState().doc.nodes[cloneId]).toBeTruthy();
    expect(getState().doc.nodes[clone.children[0]]).toBeTruthy();
    expect(getState().doc.nodes[child].parentId).toBe(frame);
  });

  it('Shift 追加选择、再次点击取消，primary 跟随选区', () => {
    const frame = getState().doc.nodes[rootId()].children[0];
    const a = editor.addNode({ type: 'rect', parentId: frame, x: 0, y: 0, w: 40, h: 40 });
    const b = editor.addNode({ type: 'rect', parentId: frame, x: 80, y: 0, w: 40, h: 40 });

    editor.select(a);
    editor.select(b, true);
    expect(getState().selectedIds).toEqual([a, b]);
    expect(getState().selectedId).toBe(a);

    editor.select(a, true);
    expect(getState().selectedIds).toEqual([b]);
    expect(getState().selectedId).toBe(b);

    editor.selectMany([a, b]);
    editor.clearSelection();
    expect(getState().selectedIds).toEqual([]);
    expect(getState().selectedId).toBeNull();
  });

  it('多选拖动只产生一条撤销记录', () => {
    const frame = getState().doc.nodes[rootId()].children[0];
    const a = editor.addNode({ type: 'rect', parentId: frame, x: 0, y: 0, w: 40, h: 40 });
    const b = editor.addNode({ type: 'rect', parentId: frame, x: 80, y: 0, w: 40, h: 40 });
    editor.selectMany([a, b]);
    const beforeCount = getState().past.length;

    editor.beginTransaction([a, b]);
    editor.updateSilent(a, { x: 10, y: 20 });
    editor.updateSilent(b, { x: 90, y: 20 });
    editor.endTransaction();
    expect(getState().past.length).toBe(beforeCount + 1);

    editor.undo();
    expect(getState().doc.nodes[a].x).toBe(0);
    expect(getState().doc.nodes[a].y).toBe(0);
    expect(getState().doc.nodes[b].x).toBe(80);
    expect(getState().doc.nodes[b].y).toBe(0);
  });

  it('对齐与等间距可单步撤销', () => {
    const frame = getState().doc.nodes[rootId()].children[0];
    const a = editor.addNode({ type: 'rect', parentId: frame, x: 0, y: 0, w: 100, h: 50 });
    const b = editor.addNode({ type: 'rect', parentId: frame, x: 200, y: 100, w: 60, h: 80 });
    const c = editor.addNode({ type: 'rect', parentId: frame, x: 500, y: 200, w: 20, h: 20 });
    editor.selectMany([a, b, c]);

    editor.alignSelection('left');
    expect(getState().doc.nodes[a].x).toBe(0);
    expect(getState().doc.nodes[b].x).toBe(0);
    expect(getState().doc.nodes[c].x).toBe(0);
    editor.undo();
    expect(getState().doc.nodes[b].x).toBe(200);
    expect(getState().doc.nodes[c].x).toBe(500);

    editor.distributeSelection('horizontal');
    expect(getState().doc.nodes[b].x).toBe(270);
    editor.undo();
    expect(getState().doc.nodes[b].x).toBe(200);
  });

  it('成组、解组可撤销重做并保持坐标', () => {
    const frame = getState().doc.nodes[rootId()].children[0];
    const a = editor.addNode({ type: 'rect', parentId: frame, x: 10, y: 20, w: 40, h: 40 });
    const b = editor.addNode({ type: 'rect', parentId: frame, x: 100, y: 20, w: 40, h: 40 });
    editor.selectMany([a, b]);

    editor.groupSelected();
    const groupId = getState().selectedId as string;
    const group = getState().doc.nodes[groupId];
    expect(group.type).toBe('group');
    expect(group.parentId).toBe(frame);
    expect(getState().doc.nodes[a].parentId).toBe(groupId);
    expect(getState().doc.nodes[b].parentId).toBe(groupId);

    editor.undo();
    expect(getState().doc.nodes[groupId]).toBeUndefined();
    expect(getState().doc.nodes[a].parentId).toBe(frame);
    expect(getState().doc.nodes[a].x).toBe(10);

    editor.redo();
    expect(getState().doc.nodes[groupId]).toBeTruthy();

    editor.ungroupSelected();
    expect(getState().doc.nodes[groupId]).toBeUndefined();
    expect(getState().doc.nodes[a].parentId).toBe(frame);
    expect(getState().doc.nodes[a].x).toBe(10);
    expect(getState().selectedIds).toEqual([a, b]);

    editor.undo();
    expect(getState().doc.nodes[groupId]).toBeTruthy();
    expect(getState().doc.nodes[a].parentId).toBe(groupId);
    expect(getState().selectedId).toBe(groupId);
  });

  it('手动参考线添加、移动、删除并逐步撤销', () => {
    editor.addGuide('x', 100);
    expect(getState().doc.pages[0].guides).toEqual([{ axis: 'x', position: 100 }]);
    const pastAfterAdd = getState().past.length;

    editor.addGuide('x', 100.4);
    expect(getState().past.length).toBe(pastAfterAdd);

    editor.moveGuide(0, 140.2);
    expect(getState().doc.pages[0].guides).toEqual([{ axis: 'x', position: 140 }]);
    editor.removeGuide(0);
    expect(getState().doc.pages[0].guides).toEqual([]);

    editor.undo();
    expect(getState().doc.pages[0].guides).toEqual([{ axis: 'x', position: 140 }]);
    editor.undo();
    expect(getState().doc.pages[0].guides).toEqual([{ axis: 'x', position: 100 }]);
    editor.undo();
    expect(getState().doc.pages[0].guides).toEqual([]);
  });

  it('批量删除一次撤销即可全部恢复', () => {
    const frame = getState().doc.nodes[rootId()].children[0];
    const a = editor.addNode({ type: 'rect', parentId: frame, x: 0, y: 0, w: 40, h: 40 });
    const b = editor.addNode({ type: 'rect', parentId: frame, x: 80, y: 0, w: 40, h: 40 });
    editor.selectMany([a, b]);
    editor.deleteSelected();
    expect(getState().doc.nodes[a]).toBeUndefined();
    expect(getState().doc.nodes[b]).toBeUndefined();

    editor.undo();
    expect(getState().doc.nodes[a]).toBeTruthy();
    expect(getState().doc.nodes[b]).toBeTruthy();
  });

  it('新建页面会切页、清空选区并进入撤销历史', () => {
    const firstPage = getState().pageId;
    const page2 = editor.addPage();
    const afterAdd = getState();
    expect(afterAdd.pageId).toBe(page2);
    expect(afterAdd.doc.pages).toHaveLength(2);
    expect(afterAdd.selectedIds).toEqual([]);
    const root2 = afterAdd.doc.nodes[afterAdd.doc.pages[1].rootId];
    expect(root2.type).toBe('page');
    expect(root2.children).toEqual([]);

    editor.undo();
    expect(getState().pageId).toBe(firstPage);
    expect(getState().doc.pages).toHaveLength(1);

    editor.redo();
    expect(getState().pageId).toBe(page2);
    expect(getState().doc.pages).toHaveLength(2);
  });

  it('页面改名同步根节点名，可撤销重做', () => {
    const pageId = getState().pageId;
    expect(editor.renamePage(pageId, '封面')).toBe(true);
    expect(getState().doc.pages[0].name).toBe('封面');
    expect(getState().doc.nodes[getState().doc.pages[0].rootId].name).toBe('封面');
    expect(editor.renamePage(pageId, '封面')).toBe(false);

    editor.undo();
    expect(getState().doc.pages[0].name).toBe('页面 1');
    editor.redo();
    expect(getState().doc.pages[0].name).toBe('封面');
  });

  it('复制页面会切到副本，复制整棵页面树并可撤销', () => {
    const page2 = editor.addPage();
    const root2 = getState().doc.nodes[getState().doc.pages[1].rootId];
    const frame2 = editor.addNode({ type: 'frame', parentId: root2.id, x: 0, y: 0, w: 300, h: 200 });
    editor.select(frame2);
    const clonePage = editor.duplicatePage(page2);
    expect(clonePage).not.toBeNull();
    if (!clonePage) return;

    const afterClone = getState();
    expect(afterClone.pageId).toBe(clonePage);
    expect(afterClone.doc.pages).toHaveLength(3);
    expect(afterClone.doc.pages[2].rootId).not.toBe(root2.id);
    const cloneRoot = afterClone.doc.nodes[afterClone.doc.pages[2].rootId];
    expect(cloneRoot.children).toHaveLength(1);
    expect(afterClone.doc.nodes[cloneRoot.children[0]].type).toBe('frame');
    expect(afterClone.selectedIds).toEqual([]);

    editor.undo();
    expect(getState().pageId).toBe(page2);
    expect(getState().doc.pages).toHaveLength(2);
    editor.redo();
    expect(getState().pageId).toBe(clonePage);
    expect(getState().doc.pages).toHaveLength(3);
  });

  it('删除当前页会切到相邻页、清空选区，撤销可恢复页面与选区', () => {
    const page1 = getState().pageId;
    const page2 = editor.addPage();
    const root2 = getState().doc.nodes[getState().doc.pages[1].rootId];
    const frame2 = editor.addNode({ type: 'frame', parentId: root2.id, x: 0, y: 0, w: 300, h: 200 });
    editor.select(frame2);

    expect(editor.deletePage(page2)).toBe(true);
    expect(getState().pageId).toBe(page1);
    expect(getState().selectedIds).toEqual([]);
    expect(getState().doc.pages).toHaveLength(1);

    editor.undo();
    expect(getState().pageId).toBe(page2);
    expect(getState().doc.pages).toHaveLength(2);
    expect(getState().doc.nodes[frame2]).toBeTruthy();
    expect(getState().selectedIds).toEqual([frame2]);

    expect(editor.deletePage(getState().pageId)).toBe(true);
    expect(editor.deletePage(getState().pageId)).toBe(false);
  });

  it('拖动页面排序可撤销重做，当前页不因排序改变', () => {
    editor.addPage();
    const page3 = editor.addPage();
    expect(editor.movePage(page3, 0)).toBe(true);
    expect(getState().doc.pages.map((page) => page.name)).toEqual(['页面 3', '页面 1', '页面 2']);
    expect(getState().pageId).toBe(page3);

    editor.undo();
    expect(getState().doc.pages.map((page) => page.name)).toEqual(['页面 1', '页面 2', '页面 3']);
    expect(getState().pageId).toBe(page3);
    editor.redo();
    expect(getState().doc.pages.map((page) => page.name)).toEqual(['页面 3', '页面 1', '页面 2']);
    expect(editor.movePage(page3, 0)).toBe(false);
  });

  it('钢笔闭合路径落盘为钢笔节点，锚点保留且可撤销', () => {
    const id = editor.addNode({
      type: 'path',
      parentId: rootId(),
      x: 40,
      y: 50,
      w: 120,
      h: 90,
      pathData: 'M 0 0 L 120 0 L 60 90 L 0 0 Z',
      pathW: 120,
      pathH: 90,
      pathAnchors: [
        { x: 0, y: 0, inX: 0, inY: 0, outX: 0, outY: 0 },
        { x: 120, y: 0, inX: 120, inY: 0, outX: 120, outY: 0 },
        { x: 60, y: 90, inX: 60, inY: 90, outX: 60, outY: 90 },
      ],
      pathClosed: true,
      fill: '#D9D9D9',
      strokes: [],
    });
    const node = getState().doc.nodes[id];
    expect(node.name).toBe('钢笔 1');
    expect(node.pathAnchors).toHaveLength(3);
    expect(node.pathAnchors?.[1]).toEqual({ x: 120, y: 0, inX: 120, inY: 0, outX: 120, outY: 0 });
    expect(node.pathClosed).toBe(true);
    expect(node.fills).toEqual([{ type: 'solid', color: '#D9D9D9', opacity: 1 }]);
    expect(node.strokes).toEqual([]);

    editor.undo();
    expect(getState().doc.nodes[id]).toBeUndefined();
  });

  it('钢笔锚点编辑重算包围盒与路径，并可单步撤销', () => {
    const id = editor.addNode({
      type: 'path',
      parentId: rootId(),
      x: 40,
      y: 50,
      w: 120,
      h: 90,
      pathData: 'M 0 0 L 120 0 L 60 90 L 0 0 Z',
      pathW: 120,
      pathH: 90,
      pathAnchors: [
        { x: 0, y: 0, inX: 0, inY: 0, outX: 0, outY: 0 },
        { x: 120, y: 0, inX: 120, inY: 0, outX: 120, outY: 0 },
        { x: 60, y: 90, inX: 60, inY: 90, outX: 60, outY: 90 },
      ],
      pathClosed: true,
      fill: '#D9D9D9',
      strokes: [],
    });
    const changed = editor.setPathAnchors(
      id,
      [
        { x: 40, y: 50 },
        { x: 100, y: 50 },
        { x: 100, y: 140 },
        { x: 40, y: 140 },
      ],
      true,
    );
    expect(changed).toBe(true);
    const node = getState().doc.nodes[id];
    expect(node.pathAnchors).toHaveLength(4);
    expect(node.pathClosed).toBe(true);
    expect(node.x).toBe(40);
    expect(node.y).toBe(50);
    expect(node.w).toBe(60);
    expect(node.h).toBe(90);

    editor.undo();
    expect(getState().doc.nodes[id].pathAnchors).toHaveLength(3);
    expect(getState().doc.nodes[id].w).toBe(120);

    editor.beginTransaction(id);
    editor.setPathAnchors(
      id,
      [
        { x: 40, y: 50 },
        { x: 100, y: 50 },
        { x: 100, y: 140 },
        { x: 40, y: 140 },
      ],
      true,
      true,
    );
    editor.setPathAnchors(
      id,
      [
        { x: 40, y: 50 },
        { x: 110, y: 40 },
        { x: 120, y: 90 },
        { x: 110, y: 140 },
        { x: 40, y: 140 },
      ],
      true,
      true,
    );
    editor.endTransaction();
    expect(getState().doc.nodes[id].pathAnchors).toHaveLength(5);
    editor.undo();
    expect(getState().doc.nodes[id].pathAnchors).toHaveLength(3);
  });

  it('钢笔节点可追加第二条轮廓，更新首条轮廓时保留分支', () => {
    const id = editor.addNode({
      type: 'path',
      parentId: rootId(),
      x: 40,
      y: 50,
      w: 120,
      h: 90,
      pathData: 'M 0 0 L 120 0 L 60 90 L 0 0 Z',
      pathW: 120,
      pathH: 90,
      pathAnchors: [
        { x: 0, y: 0, inX: 0, inY: 0, outX: 0, outY: 0 },
        { x: 120, y: 0, inX: 120, inY: 0, outX: 120, outY: 0 },
        { x: 60, y: 90, inX: 60, inY: 90, outX: 60, outY: 90 },
      ],
      pathClosed: true,
      fill: '#D9D9D9',
      strokes: [],
    });
    const changed = editor.setPathContours(id, [
      {
        closed: true,
        anchors: [
          { x: 40, y: 50 },
          { x: 160, y: 50 },
          { x: 100, y: 140 },
        ],
      },
      {
        closed: false,
        anchors: [
          { x: 220, y: 180 },
          { x: 300, y: 250 },
        ],
      },
    ]);
    expect(changed).toBe(true);
    const node = getState().doc.nodes[id];
    expect(node.pathContours).toHaveLength(2);
    expect(node.pathContours?.[1].closed).toBe(false);
    expect(node.pathAnchors).toHaveLength(3);
    expect(node.x).toBe(40);
    expect(node.y).toBe(50);
    expect(node.w).toBe(260);
    expect(node.h).toBe(200);
    expect(node.pathData?.match(/M /g)).toHaveLength(2);

    editor.setPathAnchors(
      id,
      [
        { x: 40, y: 60 },
        { x: 180, y: 60 },
        { x: 100, y: 160 },
      ],
      true,
    );
    const updated = getState().doc.nodes[id];
    expect(updated.pathContours).toHaveLength(2);
    expect(updated.pathContours?.[1].anchors).toHaveLength(2);
    expect(updated.pathAnchors?.[0].y).toBe(0);
    expect(updated.y).toBe(60);

    editor.undo();
    expect(getState().doc.nodes[id].y).toBe(50);
    editor.undo();
    expect(getState().doc.nodes[id].pathContours).toBeUndefined();
  });

  it('每一页记住自己的缩放与平移，切页后再切回仍恢复', () => {
    editor.setCanvasSize(1000, 800);
    const page1 = getState().pageId;
    editor.setViewport({ x: 12, y: 34, scale: 2 });
    const page2 = editor.addPage();
    editor.setViewport({ x: 56, y: 78, scale: 1.5 });

    editor.setPage(page1);
    expect(getState().viewport).toEqual({ x: 12, y: 34, scale: 2 });
    editor.setPage(page2);
    expect(getState().viewport).toEqual({ x: 56, y: 78, scale: 1.5 });
  });

  it('约束在画板缩放时重排子节点，并一步撤销', () => {
    const frameId = getState().doc.nodes[rootId()].children[0];
    const child = editor.addNode({ type: 'rect', parentId: frameId, x: 100, y: 80, w: 400, h: 300 });
    editor.applyPatch(child, { constraints: { horizontal: 'leftRight', vertical: 'topBottom' } });
    editor.applyPatch(frameId, { w: 1940, h: 1100 });

    expect(getState().doc.nodes[child]).toMatchObject({ x: 100, y: 80, w: 900, h: 500 });
    editor.undo();
    expect(getState().doc.nodes[child]).toMatchObject({ x: 100, y: 80, w: 400, h: 300 });
    expect(getState().doc.nodes[frameId].w).toBe(1440);
  });

  it('画布拖拽事务把约束子节点一起纳入撤销', () => {
    const frameId = getState().doc.nodes[rootId()].children[0];
    const child = editor.addNode({ type: 'rect', parentId: frameId, x: 100, y: 80, w: 400, h: 300 });
    editor.applyPatch(child, { constraints: { horizontal: 'scale', vertical: 'top' } });
    editor.beginTransaction(frameId);
    editor.updateSilent(frameId, { w: 2880, h: 900 });
    editor.endTransaction();

    expect(getState().doc.nodes[child]).toMatchObject({ x: 200, w: 800, h: 300 });
    editor.undo();
    expect(getState().doc.nodes[child]).toMatchObject({ x: 100, w: 400, h: 300 });
    expect(getState().doc.nodes[frameId].w).toBe(1440);
  });

  it('命名样式可创建、套用、同步到全部绑定图层并撤销', () => {
    const frameId = getState().doc.nodes[rootId()].children[0];
    const source = editor.addNode({ type: 'rect', parentId: frameId, x: 0, y: 0, w: 100, h: 100 });
    editor.applyPatch(source, {
      fills: [
        { type: 'solid', color: '#FF0000', opacity: 0.4 },
        { type: 'solid', color: '#0000FF', opacity: 1 },
      ],
    });
    const styleId = editor.createStyle('fill', source);
    expect(styleId).toBeTruthy();
    expect(getState().doc.styles?.[styleId!].kind).toBe('fill');
    expect(getState().doc.nodes[source].styleRefs?.fill).toBe(styleId);

    const target = editor.addNode({ type: 'rect', parentId: frameId, x: 120, y: 0, w: 100, h: 100 });
    expect(editor.applyStyle(styleId!, target)).toBe(true);
    expect(getState().doc.nodes[target].fills).toHaveLength(2);
    expect(getState().doc.nodes[target].styleRefs?.fill).toBe(styleId);

    editor.applyPatch(target, { fills: [{ type: 'solid', color: '#00FF00', opacity: 1 }] });
    expect(getState().doc.nodes[target].styleRefs?.fill).toBe(styleId);
    expect(editor.updateStyle(styleId!, target)).toBe(true);
    expect(getState().doc.nodes[source].fills[0].color).toBe('#00FF00');
    expect(getState().doc.nodes[target].fills[0].color).toBe('#00FF00');

    editor.undo();
    expect(getState().doc.nodes[source].fills[0].color).toBe('#FF0000');
    editor.undo();
    expect(getState().doc.nodes[target].styleRefs?.fill).toBe(styleId);
    editor.undo();
    expect(getState().doc.nodes[target].styleRefs).toBeUndefined();
  });

  it('loadDoc 恢复上次当前页与页级视口，非法页回退第一页', () => {
    editor.setCanvasSize(1000, 800);
    const page1 = getState().pageId;
    editor.setViewport({ x: 12, y: 34, scale: 2 });
    const page2 = editor.addPage();
    editor.setViewport({ x: 56, y: 78, scale: 1.5 });
    const doc = getState().doc;

    editor.loadDoc(doc, 'project-ui', {
      pageId: page2,
      viewports: {
        [page1]: { x: 12, y: 34, scale: 2 },
        [page2]: { x: 56, y: 78, scale: 1.5 },
      },
    });
    expect(getState().pageId).toBe(page2);
    expect(getState().viewport).toEqual({ x: 56, y: 78, scale: 1.5 });
    expect(getState().needsFit).toBe(false);

    editor.setPage(page1);
    expect(getState().viewport).toEqual({ x: 12, y: 34, scale: 2 });

    editor.loadDoc(doc, 'project-ui', { pageId: '不存在', viewports: {} });
    expect(getState().pageId).toBe(page1);
    expect(getState().selectedIds).toEqual([]);
    expect(getState().needsFit).toBe(false);
  });

  it('删除页后切到相邻页恢复它的视口，撤销删除也恢复被删页视口', () => {
    editor.setCanvasSize(1000, 800);
    editor.setViewport({ x: 11, y: 22, scale: 1.25 });
    const page2 = editor.addPage();
    editor.setViewport({ x: 33, y: 44, scale: 2.5 });

    expect(editor.deletePage(page2)).toBe(true);
    expect(getState().viewport).toEqual({ x: 11, y: 22, scale: 1.25 });
    editor.undo();
    expect(getState().pageId).toBe(page2);
    expect(getState().viewport).toEqual({ x: 33, y: 44, scale: 2.5 });
  });
});
