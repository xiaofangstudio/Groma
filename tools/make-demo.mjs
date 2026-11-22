import { createProject, readScene, writeScene } from '../mcp/lib/store.mjs';

function node(partial) {
  return {
    children: [],
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    clipContent: false,
    fills: [],
    cornerRadius: 0,
    ...partial,
  };
}

const created = createProject({ name: 'Groma-自检', dryRun: false });
const scene = readScene(created.id);
const page = scene.pages[0];
const root = scene.nodes[page.rootId];
const frameId = root.children[0];
const frame = scene.nodes[frameId];

frame.name = '桌面 1440';
frame.w = 1440;
frame.h = 900;
frame.fills = [{ type: 'solid', color: '#FFFFFF', opacity: 1 }];

const nodes = [
  node({
    id: 'rect-1',
    type: 'rect',
    name: '黄色卡片',
    parentId: frameId,
    x: 140,
    y: 160,
    w: 320,
    h: 200,
    fills: [{ type: 'solid', color: '#F2B705', opacity: 1 }],
    cornerRadius: 20,
  }),
  node({
    id: 'ellipse-1',
    type: 'ellipse',
    name: '墨色圆',
    parentId: frameId,
    x: 520,
    y: 160,
    w: 200,
    h: 200,
    fills: [{ type: 'solid', color: '#221C00', opacity: 1 }],
  }),
  node({
    id: 'text-1',
    type: 'text',
    name: '标题',
    parentId: frameId,
    x: 140,
    y: 400,
    w: 640,
    h: 120,
    text: 'Groma',
    fontSize: 96,
    fontWeight: 700,
    fills: [{ type: 'solid', color: '#221C00', opacity: 1 }],
  }),
  node({
    id: 'text-2',
    type: 'text',
    name: '副标题',
    parentId: frameId,
    x: 144,
    y: 520,
    w: 700,
    h: 60,
    text: '本地优先的界面设计工作台',
    fontSize: 26,
    fontWeight: 500,
    fills: [{ type: 'solid', color: '#6D685E', opacity: 1 }],
  }),
  node({
    id: 'rect-2',
    type: 'rect',
    name: '墨色横条',
    parentId: frameId,
    x: 140,
    y: 630,
    w: 520,
    h: 10,
    fills: [{ type: 'solid', color: '#221C00', opacity: 1 }],
    cornerRadius: 5,
  }),
];

for (const n of nodes) {
  scene.nodes[n.id] = n;
  frame.children.push(n.id);
}

writeScene(created.id, scene, { snapshotBefore: false });
console.log(created.id);
