import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 生成一个 5000 节点的真实工程，用来做画布交互压力测试。
// 用法：node tools/make-perf-project.mjs [目标目录]
const target = process.argv[2] ?? path.join(os.homedir(), 'Documents', 'Groma', 'Perf-5000.groma');
const now = Date.now();
const pageId = 'page-1';
const rootId = 'root-1';
const nodes = {};

function baseNode(id, type, name, parentId, patch = {}) {
  return {
    id,
    type,
    name,
    parentId,
    children: [],
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    clipContent: false,
    fills: [],
    cornerRadius: 0,
    ...patch,
  };
}

nodes[rootId] = baseNode(rootId, 'page', '页面 1', null, { w: 0, h: 0 });
nodes[rootId].children = [];

const frameIds = [];
for (let row = 0; row < 5; row += 1) {
  for (let col = 0; col < 10; col += 1) {
    const index = row * 10 + col + 1;
    const frameId = `frame-${index}`;
    const frame = baseNode(frameId, 'frame', `画板 ${index}`, rootId, {
      x: col * 360,
      y: row * 260,
      w: 320,
      h: 220,
      clipContent: true,
      fills: [{ type: 'solid', color: '#FFFFFF', opacity: 1 }],
    });
    frame.children = [];
    nodes[frameId] = frame;
    frameIds.push(frameId);

    for (let cell = 0; cell < 100; cell += 1) {
      const rectId = `rect-${index}-${cell + 1}`;
      const cellCol = cell % 10;
      const cellRow = Math.floor(cell / 10);
      const rect = baseNode(rectId, 'rect', `块 ${index}-${cell + 1}`, frameId, {
        x: 10 + cellCol * 30,
        y: 10 + cellRow * 20,
        w: 22,
        h: 12,
        cornerRadius: 3,
        fills: [{ type: 'solid', color: cell % 2 === 0 ? '#C9C4B8' : '#DAD5C8', opacity: 1 }],
      });
      frame.children.push(rectId);
      nodes[rectId] = rect;
    }
  }
}
nodes[rootId].children = frameIds;

const scene = {
  version: 1,
  name: 'Perf 5000',
  pages: [{ id: pageId, name: '页面 1', rootId, background: '#E9E8E4' }],
  nodes,
};
const project = {
  format: 'groma',
  formatVersion: 1,
  name: 'Perf 5000',
  createdAt: now,
  updatedAt: now,
};

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
fs.mkdirSync(path.join(target, 'snapshots'), { recursive: true });
fs.mkdirSync(path.join(target, 'exports'), { recursive: true });
fs.writeFileSync(path.join(target, 'project.json'), JSON.stringify(project, null, 2));
fs.writeFileSync(path.join(target, 'scene.json'), JSON.stringify(scene));

const count = Object.keys(nodes).length - 1;
console.log(`created ${target}`);
console.log(`frames=${frameIds.length} nodes=${count} scene=${fs.statSync(path.join(target, 'scene.json')).size} bytes`);
