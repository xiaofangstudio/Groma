import fs from 'node:fs';
import path from 'node:path';

const dir = process.env.PHONE_DIR || path.join(process.env.TEMP || '.', 'groma-phone.groma');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
fs.mkdirSync(path.join(dir, 'snapshots'), { recursive: true });

const nodes = {};
const rootId = 'root-phone';
const frameId = 'frame-phone';
nodes[rootId] = {
  id: rootId, type: 'page', name: '页面 1', parentId: null, children: [frameId],
  x: 0, y: 0, w: 0, h: 0, rotation: 0, opacity: 1, visible: true, locked: false, clipContent: false,
  fills: [], strokes: [], cornerRadius: 0,
};
nodes[frameId] = {
  id: frameId, type: 'frame', name: '手机预览', parentId: rootId,
  children: ['phone-bg', 'phone-sky', 'phone-sun', 'phone-cloud', 'phone-title'],
  x: 0, y: 0, w: 390, h: 844, rotation: 0, opacity: 1, visible: true, locked: false, clipContent: true,
  fills: [{ type: 'solid', color: '#F6F3EC', opacity: 1 }], strokes: [], cornerRadius: 0,
};
nodes['phone-bg'] = {
  id: 'phone-bg', type: 'rect', name: '底色', parentId: frameId, children: [],
  x: 0, y: 0, w: 390, h: 844, rotation: 0, opacity: 1, visible: true, locked: false, clipContent: false,
  cornerRadius: 0, fills: [{ type: 'solid', color: '#F6F3EC', opacity: 1 }], strokes: [],
};
nodes['phone-sky'] = {
  id: 'phone-sky', type: 'rect', name: '天空', parentId: frameId, children: [],
  x: 24, y: 84, w: 342, h: 596, rotation: 0, opacity: 1, visible: true, locked: false, clipContent: false,
  cornerRadius: 34,
  fills: [{
    type: 'radial', color: '#8FC8F6', opacity: 1, cx: 120, cy: 100, r: 330,
    stops: [
      { offset: 0, color: '#93CCF8', opacity: 1 },
      { offset: 0.6, color: '#5A9BE4', opacity: 1 },
      { offset: 1, color: '#29558F', opacity: 1 },
    ],
  }],
  strokes: [], effects: [{ type: 'inner-shadow', x: 0, y: 14, blur: 28, color: '#0B2A52', opacity: 0.24, visible: true }],
};
nodes['phone-sun'] = {
  id: 'phone-sun', type: 'ellipse', name: '太阳', parentId: frameId, children: [],
  x: 145, y: 210, w: 100, h: 100, rotation: 0, opacity: 1, visible: true, locked: false, clipContent: false,
  fills: [{
    type: 'radial', color: '#FFE08A', opacity: 1, cx: 50, cy: 50, r: 66,
    stops: [
      { offset: 0, color: '#FFF7D7', opacity: 1 },
      { offset: 0.55, color: '#FFD05A', opacity: 1 },
      { offset: 1, color: '#F0A03A', opacity: 1 },
    ],
  }],
  strokes: [], cornerRadius: 0,
  effects: [{ type: 'drop-shadow', x: 0, y: 10, blur: 24, color: '#B66A14', opacity: 0.34, visible: true }],
};
const cloud = (id, x, y, w, h, radius) => ({
  id, type: 'rect', name: '云', parentId: frameId, children: [],
  x, y, w, h, rotation: 0, opacity: 1, visible: true, locked: false, clipContent: false,
  cornerRadius: radius, fills: [{ type: 'solid', color: '#FFFFFF', opacity: 0.95 }], strokes: [],
  effects: [{ type: 'drop-shadow', x: 0, y: 10, blur: 22, color: '#2E5A8E', opacity: 0.24, visible: true }],
});
nodes['phone-cloud'] = cloud('phone-cloud', 82, 420, 226, 88, 44);
nodes['phone-title'] = {
  id: 'phone-title', type: 'text', name: '温度', parentId: frameId, children: [],
  x: 55, y: 560, w: 280, h: 46, rotation: 0, opacity: 1, visible: true, locked: false, clipContent: false,
  fills: [{ type: 'solid', color: '#FFFFFF', opacity: 1 }], strokes: [], cornerRadius: 0,
  text: '18°  晴间多云', fontSize: 28, fontWeight: 600, fontFamily: 'Microsoft YaHei', align: 'center',
};

fs.writeFileSync(path.join(dir, 'scene.json'), JSON.stringify({
  version: 1, name: '手机演示', pages: [{ id: 'page-phone', name: '页面 1', rootId, background: '#E9E8E4' }], nodes, assets: {},
}));
fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({
  format: 'groma', formatVersion: 1, name: '手机演示', createdAt: Date.now(), updatedAt: Date.now(),
}, null, 2));
console.log(dir);
