import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const root = join(homedir(), 'Documents', 'Groma', 'Components.groma');
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
nodes['root-1'].children = ['master-1'];
nodes['master-1'] = {
  ...base('master-1', 'frame', '按钮主组件', 'root-1', 120, 90, 360, 240),
  isComponent: true,
  clipContent: true,
  fills: [{ type: 'solid', color: '#FFFFFF', opacity: 1 }],
  cornerRadius: 24,
  layout: {
    mode: 'vertical',
    gap: 14,
    padding: { top: 24, right: 24, bottom: 24, left: 24 },
    align: 'start',
    justify: 'start',
    hug: false,
  },
};
nodes['master-1'].children = ['badge', 'title', 'body', 'cta'];
nodes.badge = {
  ...base('badge', 'rect', '徽标', 'master-1', 24, 24, 64, 20),
  fills: [{ type: 'solid', color: '#2563EB', opacity: 1 }],
  cornerRadius: 10,
};
nodes.title = {
  ...base('title', 'text', '标题', 'master-1', 24, 58, 280, 32),
  text: '主组件',
  fontSize: 24,
  fontWeight: 700,
  fills: [{ type: 'solid', color: '#171A1F', opacity: 1 }],
};
nodes.body = {
  ...base('body', 'text', '说明', 'master-1', 24, 104, 300, 44),
  text: '改这里，实例同步',
  fontSize: 15,
  fontWeight: 400,
  fills: [{ type: 'solid', color: '#6B7280', opacity: 1 }],
};
nodes.cta = {
  ...base('cta', 'rect', '行动按钮', 'master-1', 24, 162, 148, 44),
  fills: [{ type: 'solid', color: '#2563EB', opacity: 1 }],
  cornerRadius: 12,
};

const doc = {
  version: 1,
  name: '组件一期',
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
    name: 'Components',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }, null, 2),
  'utf8',
);
console.log(root);
