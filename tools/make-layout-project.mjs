import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const root = join(homedir(), 'Documents', 'Groma', 'AutoLayout.groma');
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
nodes['root-1'].children = ['frame-1'];
nodes['frame-1'] = {
  ...base('frame-1', 'frame', '自动布局验收画板', 'root-1', 0, 0, 1200, 760),
  clipContent: true,
  fills: [{ type: 'solid', color: '#F6F4EF', opacity: 1 }],
};
nodes['frame-1'].children = ['title', 'caption', 'layout-1'];
nodes.title = {
  ...base('title', 'text', '自动布局', 'frame-1', 120, 64, 760, 48),
  text: '自动布局',
  fontSize: 34,
  fontWeight: 700,
  fills: [{ type: 'solid', color: '#221C00', opacity: 1 }],
};
nodes.caption = {
  ...base('caption', 'text', '间距 / 内边距 / 对齐', 'frame-1', 120, 116, 760, 32),
  text: '横向排列 · 间距 20 · 内边距 20 · 两端对齐',
  fontSize: 16,
  fontWeight: 400,
  fills: [{ type: 'solid', color: '#6B6456', opacity: 1 }],
};
nodes['layout-1'] = {
  ...base('layout-1', 'frame', '按钮组', 'frame-1', 120, 180, 760, 120),
  fills: [{ type: 'solid', color: '#FFFFFF', opacity: 1 }],
  cornerRadius: 24,
  layout: {
    mode: 'horizontal',
    gap: 20,
    padding: { top: 28, right: 20, bottom: 28, left: 20 },
    align: 'center',
    justify: 'space-between',
    hug: false,
  },
};
nodes['layout-1'].children = ['btn-1', 'btn-2', 'btn-3', 'btn-4'];
const colors = ['#2563EB', '#0EA5E9', '#6366F1', '#F2B705'];
for (let i = 0; i < 4; i += 1) {
  nodes[`btn-${i + 1}`] = {
    ...base(`btn-${i + 1}`, 'rect', `按钮 ${i + 1}`, 'layout-1', 20 + i * 180, 28, 150, 64),
    fills: [{ type: 'solid', color: colors[i], opacity: 1 }],
    cornerRadius: 14,
  };
}

const doc = {
  version: 1,
  name: '自动布局三连',
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
    name: 'AutoLayout',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }, null, 2),
  'utf8',
);
console.log(root);
