import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 生成大量画板工程，专门压「100+ 画板」场景。
// 用法：node tools/make-many-frames-project.mjs [画板数] [每个画板子节点数] [目标目录]
const frames = Math.max(1, Number(process.argv[2] ?? 200));
const perFrame = Math.max(0, Number(process.argv[3] ?? 50));
const target = process.argv[4] ?? path.join(os.homedir(), 'Documents', 'Groma', `Perf-${frames}.groma`);
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

nodes[rootId] = baseNode(rootId, 'page', '页面 1', null);
const frameIds = [];
const cols = 20;
for (let f = 0; f < frames; f += 1) {
  const frameId = `frame-${f + 1}`;
  const frame = baseNode(frameId, 'frame', `画板 ${f + 1}`, rootId, {
    x: (f % cols) * 520,
    y: Math.floor(f / cols) * 420,
    w: 480,
    h: 360,
    clipContent: true,
    fills: [{ type: 'solid', color: '#FFFFFF', opacity: 1 }],
    cornerRadius: 12,
  });
  nodes[frameId] = frame;
  frameIds.push(frameId);
  for (let i = 0; i < perFrame; i += 1) {
    const childId = `node-${f + 1}-${i + 1}`;
    const color = i % 3 === 0 ? '#F2B705' : i % 3 === 1 ? '#221C00' : '#C9C4B8';
    const child = baseNode(childId, i % 10 === 9 ? 'text' : 'rect', i % 10 === 9 ? `标题 ${i + 1}` : `块 ${i + 1}`, frameId, {
      x: 16 + (i % 10) * 44,
      y: 16 + Math.floor(i / 10) * 46,
      w: 36,
      h: 28,
      cornerRadius: 4,
      fills: [{ type: 'solid', color, opacity: 1 }],
      ...(i % 10 === 9 ? { text: 'Aa', fontSize: 13, fontWeight: 600 } : {}),
    });
    frame.children.push(childId);
    nodes[childId] = child;
  }
}
nodes[rootId].children = frameIds;

const scene = {
  version: 1,
  name: `Perf ${frames}`,
  pages: [{ id: pageId, name: '页面 1', rootId, background: '#E9E8E4' }],
  nodes,
};
const project = {
  format: 'groma',
  formatVersion: 1,
  name: `Perf ${frames}`,
  createdAt: now,
  updatedAt: now,
};

fs.rmSync(target, { recursive: true, force: true });
for (const dir of ['snapshots', 'exports', 'assets']) fs.mkdirSync(path.join(target, dir), { recursive: true });
fs.writeFileSync(path.join(target, 'project.json'), JSON.stringify(project, null, 2));
fs.writeFileSync(path.join(target, 'scene.json'), JSON.stringify(scene));

console.log(`created ${target}`);
console.log(`frames=${frameIds.length} nodes=${Object.keys(nodes).length - 1} scene=${fs.statSync(path.join(target, 'scene.json')).size} bytes`);
