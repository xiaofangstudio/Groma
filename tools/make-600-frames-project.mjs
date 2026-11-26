import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const target = process.argv[2] ?? path.join(os.homedir(), 'Documents', 'Groma', 'Perf-600.groma');
const now = Date.now();
const pageId = 'page-1';
const rootId = 'root-1';
const nodes = {};
function baseNode(id, type, name, parentId, patch = {}) {
  return {
    id, type, name, parentId, children: [], x: 0, y: 0, w: 0, h: 0,
    rotation: 0, opacity: 1, visible: true, locked: false, clipContent: false,
    fills: [], cornerRadius: 0, ...patch,
  };
}
nodes[rootId] = baseNode(rootId, 'page', '页面 1', null, { w: 0, h: 0 });
const frameIds = [];
for (let f = 0; f < 600; f += 1) {
  const frameId = `frame-${f + 1}`;
  const col = f % 30;
  const row = Math.floor(f / 30);
  const frame = baseNode(frameId, 'frame', `画板 ${f + 1}`, rootId, {
    x: col * 520,
    y: row * 420,
    w: 400,
    h: 300,
    clipContent: true,
    fills: [{ type: 'solid', color: '#FFFFFF', opacity: 1 }],
  });
  nodes[frameId] = frame;
  frameIds.push(frameId);
  for (let i = 0; i < 8; i += 1) {
    const childId = `${frameId}-${i + 1}`;
    const rect = baseNode(childId, 'rect', `块 ${f + 1}-${i + 1}`, frameId, {
      x: 18 + (i % 4) * 96,
      y: 24 + Math.floor(i / 4) * 112,
      w: 72,
      h: 84,
      cornerRadius: 10,
      fills: [{ type: 'solid', color: i % 2 === 0 ? '#DAD5C8' : '#F2B705', opacity: 1 }],
    });
    frame.children.push(childId);
    nodes[childId] = rect;
  }
}
nodes[rootId].children = frameIds;
const scene = { version: 1, name: 'Perf 600', pages: [{ id: pageId, name: '页面 1', rootId, background: '#E9E8E4' }], nodes };
const project = { format: 'groma', formatVersion: 1, name: 'Perf 600', createdAt: now, updatedAt: now };
fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
fs.mkdirSync(path.join(target, 'snapshots'), { recursive: true });
fs.mkdirSync(path.join(target, 'exports'), { recursive: true });
fs.writeFileSync(path.join(target, 'project.json'), JSON.stringify(project, null, 2));
fs.writeFileSync(path.join(target, 'scene.json'), JSON.stringify(scene));
console.log(`created ${target}`);
console.log(`frames=${frameIds.length} nodes=${Object.keys(nodes).length - 1} scene=${fs.statSync(path.join(target, 'scene.json')).size} bytes`);
