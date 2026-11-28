import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'C:/Users/ASUS/Documents/Groma/P0.groma';
mkdirSync(join(dir, 'assets'), { recursive: true });
mkdirSync(join(dir, 'exports'), { recursive: true });
mkdirSync(join(dir, 'snapshots'), { recursive: true });

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

const root = node('root-p0', 'page', 'P0', null, 0, 0, 0, 0);
root.children = ['set-p0', 'inst-p0', 'alt-button', 'panel-p0'];

const set = node('set-p0', 'frame', '按钮变体集', 'root-p0', 80, 90, 420, 120, {
  isVariantSet: true,
  fills: [],
  clipContent: false,
});
set.children = ['variant-default', 'variant-hover', 'variant-large'];

const variantDefault = node('variant-default', 'frame', '按钮 / 默认', 'set-p0', 0, 0, 180, 54, {
  isComponent: true,
  variantSetId: 'set-p0',
  variantProps: { 状态: '默认', 尺寸: '默认' },
  fills: [{ type: 'solid', color: '#2563EB', opacity: 1 }],
  cornerRadius: 12,
  clipContent: true,
});
variantDefault.children = ['text-default'];
const textDefault = node('text-default', 'text', '默认', 'variant-default', 36, 17, 108, 20, {
  text: '默认按钮',
  fontSize: 14,
  fontWeight: 600,
  fontFamily: 'Inter',
  fills: [{ type: 'solid', color: '#FFFFFF', opacity: 1 }],
  align: 'center',
});

const variantHover = node('variant-hover', 'frame', '按钮 / 悬停', 'set-p0', 220, 0, 180, 54, {
  isComponent: true,
  variantSetId: 'set-p0',
  variantProps: { 状态: '悬停', 尺寸: '默认' },
  fills: [{ type: 'solid', color: '#F2B705', opacity: 1 }],
  cornerRadius: 18,
  clipContent: true,
});
variantHover.children = ['text-hover'];
const textHover = node('text-hover', 'text', '悬停', 'variant-hover', 36, 17, 108, 20, {
  text: '悬停按钮',
  fontSize: 14,
  fontWeight: 600,
  fontFamily: 'Inter',
  fills: [{ type: 'solid', color: '#171A1F', opacity: 1 }],
  align: 'center',
});

const variantLarge = node('variant-large', 'frame', '按钮 / 默认 / 大', 'set-p0', 0, 64, 180, 54, {
  isComponent: true,
  variantSetId: 'set-p0',
  variantProps: { 状态: '默认', 尺寸: '大' },
  fills: [{ type: 'solid', color: '#1D4ED8', opacity: 1 }],
  cornerRadius: 14,
  clipContent: true,
});
variantLarge.children = ['text-large'];
const textLarge = node('text-large', 'text', '大', 'variant-large', 36, 17, 108, 20, {
  text: '大按钮',
  fontSize: 14,
  fontWeight: 600,
  fontFamily: 'Inter',
  fills: [{ type: 'solid', color: '#FFFFFF', opacity: 1 }],
  align: 'center',
});

const instance = node('inst-p0', 'frame', '按钮实例', 'root-p0', 80, 250, 180, 54, {
  componentOf: 'variant-default',
  fills: [{ type: 'solid', color: '#2563EB', opacity: 1 }],
  cornerRadius: 12,
  clipContent: true,
});
instance.children = ['inst-text'];
const instText = node('inst-text', 'text', '默认', 'inst-p0', 36, 17, 108, 20, {
  text: '默认按钮',
  fontSize: 14,
  fontWeight: 600,
  fontFamily: 'Inter',
  fills: [{ type: 'solid', color: '#FFFFFF', opacity: 1 }],
  align: 'center',
});

const alt = node('alt-button', 'frame', '次要按钮', 'root-p0', 300, 250, 200, 54, {
  isComponent: true,
  fills: [{ type: 'solid', color: '#F2B705', opacity: 1 }],
  cornerRadius: 18,
  clipContent: true,
});
alt.children = ['alt-text'];
const altText = node('alt-text', 'text', '默认', 'alt-button', 46, 17, 108, 20, {
  text: '次要按钮',
  fontSize: 14,
  fontWeight: 600,
  fontFamily: 'Inter',
  fills: [{ type: 'solid', color: '#171A1F', opacity: 1 }],
  align: 'center',
});

const panel = node('panel-p0', 'frame', '变量卡片', 'root-p0', 80, 350, 420, 170, {
  fills: [{ type: 'solid', color: '#F7F5EF', opacity: 1 }],
  strokes: [{ color: '#E4DCCB', opacity: 1, width: 1, dash: [], cap: 'butt', join: 'miter' }],
  cornerRadius: 12,
  variableBindings: { fill: 'color-card', cornerRadius: 'radius-card', stroke: 'color-border', strokeWidth: 'border-width' },
  clipContent: true,
});
panel.children = ['panel-title', 'panel-body'];
const panelTitle = node('panel-title', 'text', '标题', 'panel-p0', 28, 26, 360, 28, {
  text: '同一组件，两种 Mode',
  fontSize: 22,
  fontWeight: 700,
  fontFamily: 'Inter',
  fills: [{ type: 'solid', color: '#171A1F', opacity: 1 }],
  variableBindings: { fill: 'color-title', fontSize: 'font-title' },
});
const panelBody = node('panel-body', 'text', '说明', 'panel-p0', 28, 68, 340, 72, {
  text: '填充与圆角绑定变量。\n切到深色 Mode 后，字面值同步刷新。\n这里没有云端依赖。',
  fontSize: 14,
  fontWeight: 400,
  fontFamily: 'Inter',
  lineHeight: 1.45,
  fills: [{ type: 'solid', color: '#6B7280', opacity: 1 }],
  variableBindings: { fill: 'color-body' },
});

const nodes = {
  'root-p0': root,
  'set-p0': set,
  'variant-default': variantDefault,
  'text-default': textDefault,
  'variant-hover': variantHover,
  'text-hover': textHover,
  'variant-large': variantLarge,
  'text-large': textLarge,
  'inst-p0': instance,
  'inst-text': instText,
  'alt-button': alt,
  'alt-text': altText,
  'panel-p0': panel,
  'panel-title': panelTitle,
  'panel-body': panelBody,
};

const scene = {
  version: 1,
  name: 'P0',
  pages: [{ id: 'page-p0', name: 'P0', rootId: 'root-p0', background: '#E9E8E4' }],
  nodes,
  assets: {},
  styles: {},
  variables: {
    theme: {
      id: 'theme',
      name: '产品主题',
      modes: [
        { id: 'light', name: '浅色' },
        { id: 'dark', name: '深色' },
      ],
      defaultModeId: 'light',
      variables: {
        'color-card': {
          id: 'color-card',
          name: '卡片底色',
          type: 'color',
          collectionId: 'theme',
          values: { light: '#F7F5EF', dark: '#1D2126' },
        },
        'radius-card': {
          id: 'radius-card',
          name: '卡片圆角',
          type: 'number',
          collectionId: 'theme',
          values: { light: 12, dark: 24 },
        },
        'color-title': {
          id: 'color-title',
          name: '标题色',
          type: 'color',
          collectionId: 'theme',
          values: { light: '#171A1F', dark: '#F7F5EF' },
        },
        'color-body': {
          id: 'color-body',
          name: '正文色',
          type: 'color',
          collectionId: 'theme',
          values: { light: '#6B7280', dark: '#CBD5E1' },
        },
        'color-border': {
          id: 'color-border',
          name: '描边色',
          type: 'color',
          collectionId: 'theme',
          values: { light: '#E4DCCB', dark: '#3A4048' },
        },
        'border-width': {
          id: 'border-width',
          name: '描边宽',
          type: 'number',
          collectionId: 'theme',
          values: { light: 1, dark: 2 },
        },
        'font-title': {
          id: 'font-title',
          name: '标题字号',
          type: 'number',
          collectionId: 'theme',
          values: { light: 22, dark: 26 },
        },
      },
    },
  },
  variableModes: { theme: 'light' },
};

writeFileSync(join(dir, 'scene.json'), JSON.stringify(scene, null, 2));
writeFileSync(
  join(dir, 'project.json'),
  JSON.stringify(
    {
      format: 'groma',
      formatVersion: 1,
      name: 'P0',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    null,
    2,
  ),
);
console.log(dir);
