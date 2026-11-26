import fs from 'node:fs';
import path from 'node:path';

const outDir = path.join(process.env.USERPROFILE || '', 'Documents', 'Groma', 'image-crop.groma');
const source = path.resolve('shots/crop-source.jpg');
const bytes = fs.statSync(source).size;
fs.mkdirSync(path.join(outDir, 'assets'), { recursive: true });
fs.copyFileSync(source, path.join(outDir, 'assets', 'lake.jpg'));

const asset = {
  id: 'asset-lake',
  name: 'lake.jpg',
  mime: 'image/jpeg',
  file: 'assets/lake.jpg',
  w: 1881,
  h: 1254,
  bytes,
};

const scene = {
  version: 1,
  name: '图片裁剪验收',
  pages: [{ id: 'page-1', name: '页面 1', rootId: 'root-1', background: '#E9E8E4' }],
  nodes: {
    'root-1': {
      id: 'root-1', type: 'page', name: '页面 1', parentId: null, children: ['frame-1'],
      x: 0, y: 0, w: 0, h: 0, rotation: 0, opacity: 1, visible: true, locked: false,
      clipContent: false, fills: [], cornerRadius: 0,
    },
    'frame-1': {
      id: 'frame-1', type: 'frame', name: '桌面 1440', parentId: 'root-1',
      children: ['text-title', 'text-sub', 'image-lake'],
      x: 0, y: 0, w: 1440, h: 900, rotation: 0, opacity: 1, visible: true, locked: false,
      clipContent: true, fills: [{ type: 'solid', color: '#F8F7F4', opacity: 1 }], cornerRadius: 0,
    },
    'text-title': {
      id: 'text-title', type: 'text', name: '标题', parentId: 'frame-1', children: [],
      x: 80, y: 54, w: 900, h: 58, rotation: 0, opacity: 1, visible: true, locked: false,
      clipContent: false, fills: [{ type: 'solid', color: '#221C00', opacity: 1 }], cornerRadius: 0,
      text: '图片裁剪 · Image Crop', fontSize: 48, fontWeight: 700,
    },
    'text-sub': {
      id: 'text-sub', type: 'text', name: '说明', parentId: 'frame-1', children: [],
      x: 82, y: 118, w: 1160, h: 34, rotation: 0, opacity: 1, visible: true, locked: false,
      clipContent: false, fills: [{ type: 'solid', color: '#6D685E', opacity: 1 }], cornerRadius: 0,
      text: '双击进入裁剪；拖动框移动，拖四角收放；PNG / SVG 导出只保留可见区域。', fontSize: 20, fontWeight: 500,
    },
    'image-lake': {
      id: 'image-lake', type: 'image', name: '高原湖泊.jpg', parentId: 'frame-1', children: [],
      x: 120, y: 200, w: 1200, h: 600, rotation: 0, opacity: 1, visible: true, locked: false,
      clipContent: false, fills: [], strokes: [], cornerRadius: 18, assetId: 'asset-lake',
      imageCrop: { x: 0.2, y: 0.18, w: 0.72, h: 0.55 },
    },
  },
  assets: { 'asset-lake': asset },
};

fs.writeFileSync(path.join(outDir, 'scene.json'), JSON.stringify(scene), 'utf8');
console.log(outDir, bytes);
