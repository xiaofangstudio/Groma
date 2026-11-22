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
});
