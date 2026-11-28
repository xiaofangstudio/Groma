import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'C:/Users/ASUS/Documents/Groma/Library.groma';
mkdirSync(join(dir, 'assets'), { recursive: true });
mkdirSync(join(dir, 'exports'), { recursive: true });
mkdirSync(join(dir, 'snapshots'), { recursive: true });
writeFileSync(
  join(dir, 'assets', 'cover.png'),
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64'),
);

const node = (id, type, name, parentId, x, y, w, h, extra = {}) => ({
  id,
  type,
  name,
  parentId,
  children: [],
  x,
  y,
  w,
  h,
  rotation: 0,
  opacity: 1,
  visible: true,
  locked: false,
  clipContent: false,
  fills: [],
  cornerRadius: 0,
  ...extra,
});

const root = node('root-lib', 'page', '组件库', null, 0, 0, 0, 0);
root.children = ['lib-badge', 'lib-cover'];

const badge = node('lib-badge', 'frame', '状态标签', 'root-lib', 80, 80, 148, 34, {
  isComponent: true,
  fills: [{ type: 'solid', color: '#FDF3D3', opacity: 1 }],
  strokes: [{ color: '#F2B705', opacity: 1, width: 1, dash: [], cap: 'butt', join: 'miter' }],
  cornerRadius: 17,
  clipContent: true,
});
badge.children = ['badge-text'];
const badgeText = node('badge-text', 'text', '标签', 'lib-badge', 28, 8, 92, 18, {
  text: '正在设计',
  fontSize: 12,
  fontWeight: 600,
  fontFamily: 'Inter',
  fills: [{ type: 'solid', color: '#6D3B00', opacity: 1 }],
  align: 'center',
});

const cover = node('lib-cover', 'frame', '封面卡片', 'root-lib', 80, 170, 240, 150, {
  isComponent: true,
  fills: [{ type: 'solid', color: '#FFFFFF', opacity: 1 }],
  cornerRadius: 14,
  clipContent: true,
});
cover.children = ['cover-image', 'cover-title'];
const coverImage = node('cover-image', 'image', '封面图', 'lib-cover', 0, 0, 240, 96, {
  assetId: 'cover-photo',
  imageCrop: { x: 0, y: 0, w: 1, h: 1 },
});
const coverTitle = node('cover-title', 'text', '标题', 'lib-cover', 18, 110, 204, 22, {
  text: '组件库封面',
  fontSize: 15,
  fontWeight: 600,
  fontFamily: 'Inter',
  fills: [{ type: 'solid', color: '#171A1F', opacity: 1 }],
});

const nodes = {
  'root-lib': root,
  'lib-badge': badge,
  'badge-text': badgeText,
  'lib-cover': cover,
  'cover-image': coverImage,
  'cover-title': coverTitle,
};

const scene = {
  version: 1,
  name: 'Library',
  pages: [{ id: 'page-lib', name: '组件库', rootId: 'root-lib', background: '#E9E8E4' }],
  nodes,
  assets: {
    'cover-photo': {
      id: 'cover-photo',
      name: 'cover.png',
      mime: 'image/png',
      file: 'assets/cover.png',
      w: 1,
      h: 1,
      bytes: 70,
    },
  },
  styles: {},
  variables: {},
  variableModes: {},
};

writeFileSync(join(dir, 'scene.json'), JSON.stringify(scene, null, 2));
writeFileSync(
  join(dir, 'project.json'),
  JSON.stringify(
    {
      format: 'groma',
      formatVersion: 1,
      name: 'Library',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    null,
    2,
  ),
);
console.log(dir);
