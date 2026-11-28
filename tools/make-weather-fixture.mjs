import fs from 'node:fs';
import path from 'node:path';

const dir = process.env.WEATHER_DIR || path.join(process.env.TEMP || '.', 'groma-weather.groma');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
fs.mkdirSync(path.join(dir, 'snapshots'), { recursive: true });

const nodes = {};
const rootId = 'root-1';
const frameId = 'frame-weather';
nodes[rootId] = {
  id: rootId, type: 'page', name: '页面 1', parentId: null, children: [frameId],
  x: 0, y: 0, w: 0, h: 0, rotation: 0, opacity: 1, visible: true, locked: false, clipContent: false,
  fills: [], strokes: [], cornerRadius: 0,
};
nodes[frameId] = {
  id: frameId, type: 'frame', name: '天气图标', parentId: rootId,
  children: ['rect-sky', 'rect-card', 'ellipse-sun', 'ellipse-cloud-a', 'ellipse-cloud-b', 'ellipse-cloud-c', 'text-label'],
  x: 0, y: 0, w: 760, h: 760, rotation: 0, opacity: 1, visible: true, locked: false, clipContent: true,
  fills: [{ type: 'solid', color: '#F4F1EA', opacity: 1 }], strokes: [], cornerRadius: 0,
};
nodes['rect-sky'] = {
  id: 'rect-sky', type: 'rect', name: '天空渐变', parentId: frameId, children: [],
  x: 96, y: 96, w: 568, h: 568, rotation: 0, opacity: 1, visible: true, locked: false, clipContent: false,
  cornerRadius: 44,
  fills: [{
    type: 'radial', color: '#8FC8F6', opacity: 1, cx: 190, cy: 170, r: 420,
    stops: [
      { offset: 0, color: '#8FC8F6', opacity: 1 },
      { offset: 0.55, color: '#5E9EE8', opacity: 1 },
      { offset: 1, color: '#2F5FA8', opacity: 1 },
    ],
  }],
  strokes: [], effects: [{ type: 'inner-shadow', x: 0, y: 18, blur: 32, color: '#0B2A52', opacity: 0.22, visible: true }],
};
nodes['rect-card'] = {
  id: 'rect-card', type: 'rect', name: '玻璃卡', parentId: frameId, children: [],
  x: 250, y: 156, w: 260, h: 448, rotation: 0, opacity: 1, visible: true, locked: false, clipContent: false,
  cornerRadius: 34,
  fills: [{ type: 'solid', color: '#FFFFFF', opacity: 0.16 }],
  strokes: [{ color: '#FFFFFF', opacity: 0.28, width: 1, dash: [], cap: 'butt', join: 'miter' }],
  effects: [{ type: 'background-blur', blur: 18, visible: true }],
};
nodes['ellipse-sun'] = {
  id: 'ellipse-sun', type: 'ellipse', name: '太阳', parentId: frameId, children: [],
  x: 322, y: 196, w: 116, h: 116, rotation: 0, opacity: 1, visible: true, locked: false, clipContent: false,
  fills: [{
    type: 'radial', color: '#FFE08A', opacity: 1, cx: 58, cy: 58, r: 74,
    stops: [
      { offset: 0, color: '#FFF6D2', opacity: 1 },
      { offset: 0.5, color: '#FFD05A', opacity: 1 },
      { offset: 1, color: '#F2A23A', opacity: 1 },
    ],
  }],
  strokes: [], cornerRadius: 0,
  effects: [{ type: 'drop-shadow', x: 0, y: 10, blur: 26, color: '#B66A14', opacity: 0.35, visible: true }],
};
const cloud = (id, x, y, w, h, radius) => ({
  id, type: 'rect', name: '云', parentId: frameId, children: [],
  x, y, w, h, rotation: 0, opacity: 1, visible: true, locked: false, clipContent: false,
  cornerRadius: radius,
  fills: [{ type: 'solid', color: '#FFFFFF', opacity: 0.94 }],
  strokes: [], effects: [{ type: 'drop-shadow', x: 0, y: 12, blur: 26, color: '#2E5A8E', opacity: 0.24, visible: true }],
});
nodes['ellipse-cloud-a'] = cloud('ellipse-cloud-a', 262, 368, 232, 104, 52);
nodes['ellipse-cloud-b'] = cloud('ellipse-cloud-b', 322, 336, 132, 122, 61);
nodes['ellipse-cloud-c'] = cloud('ellipse-cloud-c', 216, 396, 108, 76, 38);
nodes['text-label'] = {
  id: 'text-label', type: 'text', name: '温度', parentId: frameId, children: [],
  x: 292, y: 520, w: 180, h: 54, rotation: 0, opacity: 1, visible: true, locked: false, clipContent: false,
  fills: [{ type: 'solid', color: '#FFFFFF', opacity: 1 }],
  strokes: [], cornerRadius: 0,
  text: '18°  晴间多云', fontSize: 30, fontWeight: 600, fontFamily: 'Microsoft YaHei', align: 'center',
};

fs.writeFileSync(path.join(dir, 'scene.json'), JSON.stringify({
  version: 1,
  name: '天气图标',
  pages: [{ id: 'page-1', name: '页面 1', rootId, background: '#E9E8E4' }],
  nodes,
  assets: {},
}));
fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({
  format: 'groma', formatVersion: 1, name: '天气图标',
  createdAt: Date.now(), updatedAt: Date.now(),
}, null, 2));
console.log(dir);
