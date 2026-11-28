import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const root = join(homedir(), 'Documents', 'Groma', 'Prototype.groma');
await mkdir(root, { recursive: true });
await mkdir(join(root, 'assets'), { recursive: true });
await mkdir(join(root, 'exports'), { recursive: true });

const base = (id, type, name, parentId, x, y, w, h) => ({
  id, type, name, parentId, children: [], x, y, w, h,
  rotation: 0, opacity: 1, visible: true, locked: false, clipContent: false,
  fills: [], strokes: [], cornerRadius: 0,
});

const nodes = {};
nodes['root-1'] = base('root-1', 'page', '页面 1', null, 0, 0, 0, 0);
nodes['root-1'].children = ['home', 'detail'];

nodes.home = {
  ...base('home', 'frame', '首页', 'root-1', 80, 80, 390, 844),
  clipContent: true,
  fills: [{ type: 'solid', color: '#F7F8FA', opacity: 1 }],
  cornerRadius: 28,
};
nodes.home.children = ['home-kicker', 'home-title', 'home-body', 'home-cta', 'home-cta-text'];

nodes['home-kicker'] = {
  ...base('home-kicker', 'text', '眉标', 'home', 32, 118, 220, 22),
  text: 'GROMA PROTOTYPE',
  fontSize: 12,
  fontWeight: 700,
  fills: [{ type: 'solid', color: '#2563EB', opacity: 1 }],
};
nodes['home-title'] = {
  ...base('home-title', 'text', '标题', 'home', 32, 156, 320, 96),
  text: '把设计稿\n变成能点的原型',
  fontSize: 34,
  fontWeight: 700,
  lineHeight: 1.25,
  fills: [{ type: 'solid', color: '#171A1F', opacity: 1 }],
};
nodes['home-body'] = {
  ...base('home-body', 'text', '说明', 'home', 32, 282, 320, 64),
  text: '选中画板或图层，设置点击跳转目标，\n直接在本地演示。',
  fontSize: 15,
  fontWeight: 400,
  lineHeight: 1.6,
  fills: [{ type: 'solid', color: '#6B7280', opacity: 1 }],
};
nodes['home-cta'] = {
  ...base('home-cta', 'rect', '查看详情按钮', 'home', 32, 716, 326, 56),
  fills: [{ type: 'solid', color: '#2563EB', opacity: 1 }],
  cornerRadius: 16,
  prototype: { targetId: 'detail', trigger: 'click' },
};
nodes['home-cta-text'] = {
  ...base('home-cta-text', 'text', '按钮文字', 'home', 110, 734, 160, 22),
  text: '查看详情 →',
  fontSize: 16,
  fontWeight: 600,
  fills: [{ type: 'solid', color: '#FFFFFF', opacity: 1 }],
};

nodes.detail = {
  ...base('detail', 'frame', '详情页', 'root-1', 560, 80, 390, 844),
  clipContent: true,
  fills: [{ type: 'solid', color: '#FFFFFF', opacity: 1 }],
  cornerRadius: 28,
};
nodes.detail.children = ['detail-back', 'detail-back-text', 'detail-title', 'detail-card', 'detail-card-title', 'detail-card-body'];

nodes['detail-back'] = {
  ...base('detail-back', 'rect', '返回按钮', 'detail', 24, 52, 116, 40),
  fills: [{ type: 'solid', color: '#EEF2FF', opacity: 1 }],
  cornerRadius: 10,
  prototype: { targetId: 'home', trigger: 'click' },
};
nodes['detail-back-text'] = {
  ...base('detail-back-text', 'text', '返回文字', 'detail', 42, 62, 90, 20),
  text: '← 返回首页',
  fontSize: 13,
  fontWeight: 600,
  fills: [{ type: 'solid', color: '#2563EB', opacity: 1 }],
};
nodes['detail-title'] = {
  ...base('detail-title', 'text', '详情标题', 'detail', 24, 132, 320, 48),
  text: '详情页',
  fontSize: 30,
  fontWeight: 700,
  fills: [{ type: 'solid', color: '#171A1F', opacity: 1 }],
};
nodes['detail-card'] = {
  ...base('detail-card', 'rect', '信息卡', 'detail', 24, 208, 342, 260),
  fills: [{ type: 'solid', color: '#F3F4F6', opacity: 1 }],
  cornerRadius: 20,
};
nodes['detail-card-title'] = {
  ...base('detail-card-title', 'text', '卡片标题', 'detail', 48, 236, 280, 28),
  text: '这是第二屏',
  fontSize: 20,
  fontWeight: 600,
  fills: [{ type: 'solid', color: '#171A1F', opacity: 1 }],
};
nodes['detail-card-body'] = {
  ...base('detail-card-body', 'text', '卡片说明', 'detail', 48, 280, 290, 120),
  text: '点击左上角返回，回到首页。\n演示时可继续点按钮循环跳转。',
  fontSize: 14,
  fontWeight: 400,
  lineHeight: 1.7,
  fills: [{ type: 'solid', color: '#6B7280', opacity: 1 }],
};

const doc = {
  version: 1,
  name: '原型一期',
  pages: [{ id: 'page-1', name: '页面 1', rootId: 'root-1', background: '#E9E8E4' }],
  nodes,
  assets: {},
};
await writeFile(join(root, 'scene.json'), JSON.stringify(doc), 'utf8');
await writeFile(
  join(root, 'project.json'),
  JSON.stringify({
    format: 'groma',
    formatVersion: 1,
    name: 'Prototype',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }, null, 2),
  'utf8',
);
console.log(root);
