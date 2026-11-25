import fs from 'node:fs';
import path from 'node:path';

const root = path.join(process.env.USERPROFILE, 'Documents', 'Groma');
const target = path.join(root, 'mask-demo.groma');
fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(path.join(target, 'exports'), { recursive: true });
fs.mkdirSync(path.join(target, 'snapshots'), { recursive: true });
fs.mkdirSync(path.join(target, 'assets'), { recursive: true });
fs.writeFileSync(
  path.join(target, 'project.json'),
  JSON.stringify({ format: 'groma', formatVersion: 1, name: '形状蒙版演示', createdAt: Date.now(), updatedAt: Date.now() }, null, 2),
);

const base = {
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
  strokes: [],
  cornerRadius: 0,
};
const node = (id, type, name, parentId, extra = {}) => ({ ...base, id, type, name, parentId, ...extra });

const nodes = {
  'root-1': node('root-1', 'page', '页面 1', null, { children: ['frame-1'] }),
  'frame-1': node('frame-1', 'frame', '桌面 1440', 'root-1', {
    children: ['title-1', 'mask-shape', 'big-rect', 'mask-label'],
    w: 1440,
    h: 900,
    clipContent: true,
    fills: [{ type: 'solid', color: '#FFFFFF', opacity: 1 }],
  }),
  'title-1': node('title-1', 'text', '说明标题', 'frame-1', {
    x: 80,
    y: 48,
    w: 560,
    h: 80,
    text: '形状蒙版 Shape Mask',
    fontSize: 46,
    fontWeight: 700,
    align: 'left',
    lineHeight: 1.2,
    italic: false,
    fills: [{ type: 'solid', color: '#221C00', opacity: 1 }],
  }),
  'mask-shape': node('mask-shape', 'ellipse', '椭圆蒙版', 'frame-1', {
    x: 260,
    y: 210,
    w: 500,
    h: 400,
    fills: [{ type: 'solid', color: '#F2B705', opacity: 1 }],
  }),
  'big-rect': node('big-rect', 'rect', '蓝色大图层', 'frame-1', {
    x: 80,
    y: 150,
    w: 1080,
    h: 620,
    cornerRadius: 28,
    fills: [{ type: 'solid', color: '#2F6BFF', opacity: 1 }],
  }),
  'mask-label': node('mask-label', 'text', '蒙版内文字', 'frame-1', {
    x: 300,
    y: 370,
    w: 420,
    h: 100,
    text: 'MASK',
    fontSize: 96,
    fontWeight: 700,
    align: 'center',
    lineHeight: 1.2,
    italic: false,
    fills: [{ type: 'solid', color: '#FFFFFF', opacity: 1 }],
  }),
};

const scene = {
  version: 1,
  name: '形状蒙版演示',
  pages: [{ id: 'page-1', name: '页面 1', rootId: 'root-1', background: '#E9E8E4' }],
  nodes,
};
fs.writeFileSync(path.join(target, 'scene.json'), JSON.stringify(scene), 'utf8');
console.log(target);
