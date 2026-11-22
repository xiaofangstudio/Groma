import { describe, expect, it } from 'vitest';
import { applyCommand, collectSubtree } from '../core/commands';
import { createDoc } from '../core/doc';
import { hitTest } from '../core/geometry';
import { deserializeDoc } from '../core/serialize';
import { validateDoc } from '../core/schema';
import { editor, getState } from '../state/editor';
import type { GromaDoc, SceneNode } from '../core/types';

const N = 5000;
const COLS = 50;
const X0 = 120;
const Y0 = 120;
const NODE_W = 40;
const NODE_H = 20;
const STEP_X = 48;
const STEP_Y = 30;

function makeRect(i: number, parentId: string): SceneNode {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  return {
    id: `bench-${i}`,
    type: 'rect',
    name: `节点 ${i}`,
    parentId,
    children: [],
    x: X0 + col * STEP_X,
    y: Y0 + row * STEP_Y,
    w: NODE_W,
    h: NODE_H,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    clipContent: false,
    fills: [{ type: 'solid', color: i % 2 ? '#F2B705' : '#221C00', opacity: 1 }],
    cornerRadius: 4,
  };
}

function makeScene(count = N): { doc: GromaDoc; frameId: string; ids: string[] } {
  const doc = createDoc('5000 节点基准');
  const page = doc.pages[0];
  const root = doc.nodes[page.rootId];
  const frameId = root.children[0];
  const frame = doc.nodes[frameId];
  frame.w = X0 * 2 + COLS * STEP_X;
  frame.h = Y0 * 2 + Math.ceil(count / COLS) * STEP_Y;
  frame.children = [];
  const ids: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const node = makeRect(i, frameId);
    doc.nodes[node.id] = node;
    frame.children.push(node.id);
    ids.push(node.id);
  }
  return { doc, frameId, ids };
}

function now(): number {
  return performance.now();
}

function avg(iterations: number, fn: () => void): number {
  const start = now();
  for (let i = 0; i < iterations; i += 1) fn();
  return (now() - start) / iterations;
}

describe('地基基准', () => {
  it(`5000 节点：命中、撤销、序列化、子树复制`, () => {    const { doc, ids } = makeScene();
    const page = doc.pages[0];

    // 最深/最后绘制的节点：只检查 1 个包围盒
    const last = doc.nodes[ids[ids.length - 1]];
    const hitLast = avg(200, () => {
      hitTest(doc, page, last.x + last.w / 2, last.y + last.h / 2);
    });

    // 最底层节点：需要从 5000 个兄弟中逆序检查到底
    const first = doc.nodes[ids[0]];
    const hitFirst = avg(200, () => {
      hitTest(doc, page, first.x + first.w / 2, first.y + first.h / 2);
    });

    // 200 步属性补丁后连续撤销
    editor.loadDoc(doc, 'bench');
    const target = ids[ids.length - 1];
    for (let i = 0; i < 200; i += 1) {
      editor.applyPatch(target, { x: i + 1 });
    }
    const undoStart = now();
    for (let i = 0; i < 200; i += 1) editor.undo();
    const undoMs = now() - undoStart;
    expect(getState().doc.nodes[target].x).toBe(doc.nodes[target].x);
    expect(JSON.stringify(getState().doc)).toBe(JSON.stringify(doc));

    // 序列化 100 次：「写→读→写」字节级一致，同时量校验开销
    const serializeStart = now();
    let lastLength = 0;
    let roundtripMismatch = 0;
    for (let i = 0; i < 100; i += 1) {
      const text = JSON.stringify(doc);
      lastLength = text.length;
      const roundtrip = JSON.stringify(deserializeDoc(text));
      if (roundtrip !== text) roundtripMismatch += 1;
    }
    const serializeMs = now() - serializeStart;
    const parseStart = now();
    for (let i = 0; i < 100; i += 1) JSON.parse(JSON.stringify(doc));
    const parseMs = now() - parseStart;
    const validationMs = avg(20, () => {
      validateDoc(doc);
    });

    // 2000 节点子树复制：验证深拷贝不是 O(n^2)
    const cloneSource = makeScene(2000);
    const cloneFrame = cloneSource.doc.nodes[cloneSource.frameId];
    let seq = 0;
    const cloneStart = now();
    const cloned = applyCommand(cloneSource.doc, {
      type: 'clone',
      id: cloneFrame.id,
      makeId: (type) => `clone-${type}-${++seq}`,
      dx: 12,
      dy: 12,
      nameSuffix: ' 副本',
    });
    const cloneMs = now() - cloneStart;
    expect(collectSubtree(cloned.doc, cloned.node!.id)).toBeTruthy();

    const row = {
      节点: N,
      命中_末节点_ms: hitLast.toFixed(3),
      命中_首节点_ms: hitFirst.toFixed(3),
      撤销_200步_ms: undoMs.toFixed(1),
      序列化往返_100次_ms: serializeMs.toFixed(1),
      校验_1次_ms: validationMs.toFixed(1),
      序列化往返不一致: roundtripMismatch,
      解析_100次_ms: parseMs.toFixed(1),
      复制_2000节点_ms: cloneMs.toFixed(1),
      序列化字节: lastLength,
    };
    console.log('\n[bench] 5000 节点地基', row);

    expect(hitFirst).toBeLessThan(10);
    expect(undoMs).toBeLessThan(2000);
    expect(roundtripMismatch).toBe(0);
  }, 90000);
});
