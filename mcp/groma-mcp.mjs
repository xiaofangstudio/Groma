#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  addFrame,
  addFrameGrid,
  addNode,
  addPage,
  createDefaultDoc,
  createProject,
  deleteNode,
  duplicateFrame,
  findNode,
  listNodes,
  listProjects,
  projectDir,
  readScene,
  reorderNode,
  rootDir,
  summaryOf,
  updateNode,
  updateNodes,
  updatePageConfig,
  writeScene,
} from './lib/store.mjs';

const VERSION = '0.3.4';

function ok(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function fail(err) {
  return {
    isError: true,
    content: [{ type: 'text', text: `Groma MCP 错误：${err instanceof Error ? err.message : String(err)}` }],
  };
}

function wrap(fn) {
  return async (args) => {
    try {
      return ok(await fn(args));
    } catch (err) {
      return fail(err);
    }
  };
}

const effectSchema = z.union([
  z.object({
    type: z.literal('drop-shadow'),
    x: z.number(),
    y: z.number(),
    blur: z.number().min(0).max(1000),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    opacity: z.number().min(0).max(1),
    visible: z.boolean().default(true),
  }),
  z.object({
    type: z.literal('layer-blur'),
    blur: z.number().min(0).max(1000),
    visible: z.boolean().default(true),
  }),
]);

const paintStopSchema = z.object({
  offset: z.number().min(0).max(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  opacity: z.number().min(0).max(1),
});
const paintSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('solid'), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), opacity: z.number().min(0).max(1), visible: z.boolean().optional() }),
  z.object({
    type: z.literal('linear'),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    opacity: z.number().min(0).max(1),
    x1: z.number(),
    y1: z.number(),
    x2: z.number(),
    y2: z.number(),
    stops: z.array(paintStopSchema).min(1).max(32),
    visible: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('radial'),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    opacity: z.number().min(0).max(1),
    cx: z.number(),
    cy: z.number(),
    r: z.number().positive(),
    stops: z.array(paintStopSchema).min(1).max(32),
    visible: z.boolean().optional(),
  }),
]);

const layoutSchema = z.object({
  mode: z.enum(['horizontal', 'vertical']),
  gap: z.number().min(0).max(10000),
  padding: z.object({
    top: z.number().min(0).max(100000),
    right: z.number().min(0).max(100000),
    bottom: z.number().min(0).max(100000),
    left: z.number().min(0).max(100000),
  }),
  align: z.enum(['start', 'center', 'end', 'stretch']),
  justify: z.enum(['start', 'center', 'end', 'space-between']),
  hug: z.boolean(),
  hugWidth: z.boolean().optional(),
  hugHeight: z.boolean().optional(),
});

const nodePatchShape = {
  name: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  w: z.number().positive().optional(),
  h: z.number().positive().optional(),
  rotation: z.number().optional(),
  cornerRadius: z.number().min(0).optional(),
  cornerRadii: z.tuple([z.number().min(0), z.number().min(0), z.number().min(0), z.number().min(0)]).optional(),
  opacity: z.number().min(0).max(1).optional(),
  visible: z.boolean().optional(),
  locked: z.boolean().optional(),
  clipContent: z.boolean().optional(),
  fillColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  fills: z.array(paintSchema).max(16).optional(),
  constraints: z.object({ horizontal: z.enum(['left', 'right', 'center', 'leftRight', 'scale']), vertical: z.enum(['top', 'bottom', 'center', 'topBottom', 'scale']) }).optional(),
  layout: layoutSchema.optional(),
  layoutGrow: z.boolean().optional(),
  layoutBaseW: z.number().positive().optional(),
  layoutBaseH: z.number().positive().optional(),
  layoutAlignSelf: z.enum(['start', 'center', 'end', 'stretch']).optional(),
  text: z.string().optional(),
  fontSize: z.number().positive().optional(),
  fontWeight: z.number().positive().optional(),
  letterSpacing: z.number().optional(),
  lineHeight: z.number().positive().optional(),
  paragraphSpacing: z.number().min(0).optional(),
  listStyle: z.enum(['none', 'bullet', 'number']).optional(),
  effects: z.array(effectSchema).max(12).optional(),
  prototype: z.union([
    z.object({ targetId: z.string().min(1), trigger: z.literal('click').optional().default('click') }),
    z.null(),
  ]).optional(),
};

const server = new McpServer({ name: 'groma', version: VERSION });

server.registerTool(
  'groma_capabilities',
  {
    title: '读取 MCP 能力',
    description: '返回版本、可读写节点类型、批量上限与当前未支持能力，供外部客户端先探能力再调用。只读。',
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true },
  },
  wrap(() => ({
    version: VERSION,
    tools: 19,
    nodeTypes: {
      read: ['page', 'frame', 'section', 'rect', 'ellipse', 'text', 'group', 'boolean', 'path', 'image', 'slice'],
      create: ['frame', 'section', 'rect', 'ellipse', 'text', 'slice'],
      update: ['name', 'x', 'y', 'w', 'h', 'rotation', 'cornerRadius', 'cornerRadii', 'opacity', 'visible', 'locked', 'clipContent', 'fillColor', 'fills', 'constraints', 'layout', 'layoutGrow', 'layoutBaseW', 'layoutBaseH', 'layoutAlignSelf', 'text', 'fontSize', 'fontWeight', 'letterSpacing', 'lineHeight', 'paragraphSpacing', 'listStyle', 'effects', 'prototype'],
    },
    limits: { listNodes: 1000, batchUpdate: 200, frameGrid: 500, effectsPerNode: 12, snapshots: 20 },
    notSupported: ['group/ungroup write', 'boolean ops', 'path/image write', 'SVG/PNG/CSS export', 'component/variables'],
    writeGuard: '所有写工具默认 dryRun=true，dryRun=false 才落盘并写前快照',
  })),
);

server.registerTool(
  'groma_list_projects',
  {
    title: '列出 Groma 工程',
    description: `列出 ${path.join(rootDir(), '*.groma')} 下的本地工程，按最近修改排序。只读。`,
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true },
  },
  wrap(() => listProjects()),
);

server.registerTool(
  'groma_project_summary',
  {
    title: '读取工程摘要',
    description: '返回一个 .groma 工程的名称、页面数、画板数、节点数与画板包围盒。只读。',
    inputSchema: z.object({ id: z.string().describe('工程 id，即 .groma 目录名去掉后缀') }),
    annotations: { readOnlyHint: true },
  },
  wrap(({ id }) => summaryOf(id)),
);

server.registerTool(
  'groma_read_scene',
  {
    title: '读取场景 JSON',
    description: '读取工程的 scene.json 并做结构校验。只读。大工程请优先用 groma_project_summary。',
    inputSchema: z.object({ id: z.string() }),
    annotations: { readOnlyHint: true },
  },
  wrap(({ id }) => ({ id, scene: readScene(id) })),
);

server.registerTool(
  'groma_list_nodes',
  {
    title: '列出节点',
    description:
      '按树顺序扁平列出节点，可按父节点、类型或名称/文字关键词过滤。默认最多 200 条；百块画板的大工程用它替代整份 scene.json。只读。',
    inputSchema: z.object({
      id: z.string(),
      rootId: z.string().optional().describe('从哪个节点开始；缺省为第一页根节点'),
      type: z.string().optional().describe('frame / section / rect / ellipse / text / group / slice'),
      query: z.string().optional().describe('名称或文本关键词，不区分大小写'),
      limit: z.number().int().min(1).max(1000).optional().default(200),
    }),
    annotations: { readOnlyHint: true },
  },
  wrap(({ id, ...options }) => ({ id, ...listNodes(readScene(id), options) })),
);

server.registerTool(
  'groma_read_node',
  {
    title: '读取单个节点',
    description: '按 id 读取一个节点的完整字段，并返回父节点与所属页面。改一个大工程前先精确读一个节点，不必拉整份 scene。只读。',
    inputSchema: z.object({
      id: z.string(),
      nodeId: z.string(),
    }),
    annotations: { readOnlyHint: true },
  },
  wrap(({ id, nodeId }) => {
    const scene = readScene(id);
    const node = findNode(scene, nodeId);
    let top = node;
    while (top.parentId) {
      const parent = scene.nodes[top.parentId];
      if (!parent) break;
      top = parent;
    }
    const page = scene.pages.find((item) => item.rootId === top.id);
    return {
      id,
      node,
      parent: node.parentId ? scene.nodes[node.parentId] ?? null : null,
      pageId: page?.id ?? null,
    };
  }),
);

server.registerTool(
  'groma_add_node',
  {
    title: '新增节点',
    description:
      '在指定父节点下追加矩形、椭圆、文本、画板、区块或切片。文本可带字号、字重、字距、行高、段距与列表样式。默认 dryRun=true。',
    inputSchema: z.object({
      id: z.string(),
      parentId: z.string(),
      type: z.enum(['frame', 'section', 'rect', 'ellipse', 'text', 'slice']),
      name: z.string().optional(),
      x: z.number().optional().default(0),
      y: z.number().optional().default(0),
      w: z.number().positive().optional().default(320),
      h: z.number().positive().optional().default(200),
      fill: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe('填充色；文本默认 #221C00，其余默认 #D9D9D9'),
      cornerRadius: z.number().min(0).optional().default(0),
      text: z.string().optional(),
      fontSize: z.number().positive().optional(),
      fontWeight: z.number().positive().optional(),
      letterSpacing: z.number().optional(),
      lineHeight: z.number().positive().optional(),
      paragraphSpacing: z.number().min(0).optional(),
      listStyle: z.enum(['none', 'bullet', 'number']).optional(),
      dryRun: z.boolean().optional().default(true),
    }),
  },
  wrap(({ id, dryRun, ...input }) => {
    const scene = readScene(id);
    const node = addNode(scene, input);
    if (!dryRun) writeScene(id, scene);
    return { id, node, dryRun, written: !dryRun };
  }),
);

server.registerTool(
  'groma_add_page',
  {
    title: '新增页面',
    description:
      '追加一页，可同时创建默认画板。页面只影响 scene.pages 与新的 page 根节点，不搬动已有内容。默认 dryRun=true。',
    inputSchema: z.object({
      id: z.string(),
      name: z.string().optional(),
      background: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().default('#E9E8E4'),
      frameName: z.string().optional().describe('填写后自动建一块 w×h 的白色画板'),
      w: z.number().positive().optional().default(1440),
      h: z.number().positive().optional().default(900),
      dryRun: z.boolean().optional().default(true),
    }),
  },
  wrap(({ id, dryRun, ...input }) => {
    const scene = readScene(id);
    const page = addPage(scene, input);
    if (!dryRun) writeScene(id, scene);
    return { id, ...page, dryRun, written: !dryRun };
  }),
);

server.registerTool(
  'groma_update_page',
  {
    title: '修改页面',
    description: '改页面名称或画布背景色，页面根节点名称同步。默认 dryRun=true。',
    inputSchema: z.object({
      id: z.string(),
      pageId: z.string().optional().describe('缺省为第一页'),
      name: z.string().optional(),
      background: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      dryRun: z.boolean().optional().default(true),
    }),
  },
  wrap(({ id, pageId, dryRun, ...patch }) => {
    const scene = readScene(id);
    const page = updatePageConfig(scene, { pageId: pageId ?? null, ...patch });
    if (!dryRun) writeScene(id, scene);
    return { id, ...page, dryRun, written: !dryRun };
  }),
);

server.registerTool(
  'groma_create_project',
  {
    title: '新建工程',
    description:
      '在本地工程根目录创建一个 .groma 工程，默认包含一页和一个 1440×900 画板。默认 dryRun=true 只预览 id 与路径；只有 dryRun=false 才真正落盘。',
    inputSchema: z.object({
      name: z.string().describe('工程名称，最长 40 字'),
      dryRun: z.boolean().optional().default(true).describe('默认 true；false 才写入磁盘'),
    }),
    annotations: { readOnlyHint: false },
  },
  wrap(({ name, dryRun }) => {
    const result = createProject({ name, dryRun });
    return {
      id: result.id,
      path: result.dir,
      dryRun: result.dryRun,
      created: result.created,
      frames: 1,
      message: result.dryRun ? '未写盘；确认后传 dryRun=false' : '工程已创建',
    };
  }),
);

server.registerTool(
  'groma_add_frame',
  {
    title: '新增画板',
    description:
      '在工程第一页追加一个画板，默认放在现有画板右侧 80px。默认 dryRun=true；false 时写盘并自动生成写前快照。',
    inputSchema: z.object({
      id: z.string(),
      name: z.string().optional(),
      x: z.number().optional(),
      y: z.number().optional(),
      w: z.number().positive().optional().default(1440),
      h: z.number().positive().optional().default(900),
      fill: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().default('#FFFFFF'),
      dryRun: z.boolean().optional().default(true),
    }),
  },
  wrap(({ id, dryRun, ...frameInput }) => {
    const scene = readScene(id);
    const frame = addFrame(scene, frameInput);
    if (!dryRun) writeScene(id, scene);
    return { id, frame, dryRun, written: !dryRun };
  }),
);

server.registerTool(
  'groma_create_frame_grid',
  {
    title: '批量建画板网格',
    description:
      '一次在第一页建 rows×cols 块画板，最多 500 块，用于百画板压测或批量出画布。默认 dryRun=true；false 时只写一次盘并生成一份写前快照。',
    inputSchema: z.object({
      id: z.string(),
      rows: z.number().int().min(1).max(100).optional().default(10),
      cols: z.number().int().min(1).max(50).optional().default(10),
      w: z.number().positive().optional().default(480),
      h: z.number().positive().optional().default(360),
      gapX: z.number().min(0).optional().default(80),
      gapY: z.number().min(0).optional().default(80),
      x: z.number().optional().default(0),
      y: z.number().optional().default(0),
      namePrefix: z.string().optional().default('画板'),
      fill: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().default('#FFFFFF'),
      dryRun: z.boolean().optional().default(true),
    }),
  },
  wrap(({ id, dryRun, ...input }) => {
    const scene = readScene(id);
    const grid = addFrameGrid(scene, input);
    if (!dryRun) writeScene(id, scene);
    return { id, ...grid, dryRun, written: !dryRun };
  }),
);

server.registerTool(
  'groma_update_node',
  {
    title: '修改节点属性',
    description:
      '修改节点的位置、尺寸、旋转、圆角、透明度、显隐、锁定、裁剪、名称、纯色填充、约束、自动布局与点击原型目标；文本还可改内容与字距、行高、段距、列表。prototype 传 {targetId} 设置跳转，传 null 清除。默认 dryRun=true。',
    inputSchema: z.object({
      id: z.string(),
      nodeId: z.string(),
      ...nodePatchShape,
      dryRun: z.boolean().optional().default(true),
    }),
  },
  wrap(({ id, nodeId, dryRun, ...patch }) => {
    const scene = readScene(id);
    const node = updateNode(scene, nodeId, patch);
    if (!dryRun) writeScene(id, scene);
    return { id, node, dryRun, written: !dryRun };
  }),
);

server.registerTool(
  'groma_update_nodes',
  {
    title: '批量修改节点',
    description:
      '一次改最多 200 个节点，只读一次 scene、只写一次盘、只留一份写前快照。适合百画板统一改尺寸、改名、批量位移。默认 dryRun=true。',
    inputSchema: z.object({
      id: z.string(),
      changes: z.array(z.object({ nodeId: z.string(), patch: z.object(nodePatchShape).default({}) })).min(1).max(200),
      dryRun: z.boolean().optional().default(true),
    }),
  },
  wrap(({ id, changes, dryRun }) => {
    const scene = readScene(id);
    const nodes = updateNodes(scene, changes);
    if (!dryRun) writeScene(id, scene);
    return {
      id,
      updated: nodes.length,
      ids: nodes.map((node) => node.id),
      dryRun,
      written: !dryRun,
    };
  }),
);

server.registerTool(
  'groma_update_effects',
  {
    title: '设置图层效果',
    description:
      '整体替换一个节点的投影与整层模糊，最多 12 条。传空数组会清空效果。默认 dryRun=true；false 时写盘并保留快照。',
    inputSchema: z.object({
      id: z.string(),
      nodeId: z.string(),
      effects: z.array(effectSchema).max(12),
      dryRun: z.boolean().optional().default(true),
    }),
  },
  wrap(({ id, nodeId, effects, dryRun }) => {
    const scene = readScene(id);
    const node = updateNode(scene, nodeId, { effects });
    if (!dryRun) writeScene(id, scene);
    return { id, node, dryRun, written: !dryRun };
  }),
);

server.registerTool(
  'groma_reorder_node',
  {
    title: '调整图层顺序',
    description: '把节点移到父节点 children 的指定索引，或 front（最上层）/ back（最下层）。默认 dryRun=true。',
    inputSchema: z.object({
      id: z.string(),
      nodeId: z.string(),
      index: z.union([z.number().int().min(0), z.enum(['front', 'back'])]),
      dryRun: z.boolean().optional().default(true),
    }),
  },
  wrap(({ id, nodeId, index, dryRun }) => {
    const scene = readScene(id);
    const result = reorderNode(scene, nodeId, index);
    if (!dryRun) writeScene(id, scene);
    return { id, ...result, dryRun, written: !dryRun };
  }),
);

server.registerTool(
  'groma_duplicate_frame',
  {
    title: '复制画板',
    description: '复制一个画板到其右侧 40px，标题加「副本」。默认 dryRun=true。',
    inputSchema: z.object({
      id: z.string(),
      nodeId: z.string(),
      dryRun: z.boolean().optional().default(true),
    }),
  },
  wrap(({ id, nodeId, dryRun }) => {
    const scene = readScene(id);
    const node = duplicateFrame(scene, nodeId);
    if (!dryRun) writeScene(id, scene);
    return { id, node, dryRun, written: !dryRun };
  }),
);

server.registerTool(
  'groma_delete_node',
  {
    title: '删除节点',
    description: '删除一个画板及其子树，不能删除页面根节点。默认 dryRun=true；这是破坏性写操作，写前会做快照。',
    inputSchema: z.object({
      id: z.string(),
      nodeId: z.string(),
      dryRun: z.boolean().optional().default(true),
    }),
    annotations: { destructiveHint: true },
  },
  wrap(({ id, nodeId, dryRun }) => {
    const scene = readScene(id);
    const result = deleteNode(scene, nodeId);
    if (!dryRun) writeScene(id, scene);
    return { id, ...result, dryRun, written: !dryRun };
  }),
);

server.registerTool(
  'groma_snapshot_info',
  {
    title: '查看工程存储位置',
    description: '返回工程实际目录、场景文件与快照数量，便于排查「文件到底写哪了」。只读。',
    inputSchema: z.object({ id: z.string() }),
    annotations: { readOnlyHint: true },
  },
  wrap(({ id }) => {
    const dir = projectDir(id);
    const snapshots = fs.existsSync(path.join(dir, 'snapshots'))
      ? fs.readdirSync(path.join(dir, 'snapshots')).filter((f) => f.endsWith('.json')).length
      : 0;
    return {
      id,
      root: rootDir(),
      dir,
      scene: path.join(dir, 'scene.json'),
      meta: path.join(dir, 'project.json'),
      snapshots,
    };
  }),
);

async function selftest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'groma-mcp-'));
  process.env.GROMA_MCP_ROOT = tmp;
  try {
    const created = createProject({ name: '自检工程', dryRun: false });
    if (!created.created) throw new Error('工程未创建');
    const scene = readScene(created.id);
    const root = Object.values(scene.nodes).find((n) => n.type === 'page');
    if (!root || root.children.length !== 1) throw new Error('默认场景结构错误');

    const frame = addFrame(scene, { name: '自检画板', x: 1600, y: 120, w: 800, h: 600 });
    writeScene(created.id, scene);
    const loaded = readScene(created.id);
    if (!loaded.nodes[frame.id]) throw new Error('新增画板未落盘');

    updateNode(loaded, frame.id, { x: 120, fillColor: '#F2B705', opacity: 0.8, cornerRadii: [24, 0, 16, 8] });
    writeScene(created.id, loaded);
    const again = readScene(created.id);
    const node = again.nodes[frame.id];
    if (node.x !== 120 || node.fills[0].color !== '#F2B705') throw new Error('节点更新未生效');
    if (!Array.isArray(node.cornerRadii) || node.cornerRadii[1] !== 0) throw new Error('四角圆角未落盘');

    updateNode(again, frame.id, {
      fills: [
        { type: 'solid', color: '#FF0000', opacity: 0.4 },
        { type: 'solid', color: '#0000FF', opacity: 1, visible: false },
      ],
      constraints: { horizontal: 'leftRight', vertical: 'topBottom' },
      layout: {
        mode: 'horizontal',
        gap: 12,
        padding: { top: 16, right: 16, bottom: 16, left: 16 },
        align: 'center',
        justify: 'space-between',
        hug: false,
      },
    });
    writeScene(created.id, again);
    const layered = readScene(created.id).nodes[frame.id];
    if (layered.fills.length !== 2 || layered.fills[1].visible !== false) throw new Error('多填充未落盘');
    if (layered.constraints?.horizontal !== 'leftRight') throw new Error('约束未落盘');
    if (layered.layout?.mode !== 'horizontal' || layered.layout?.padding.left !== 16) throw new Error('自动布局未落盘');

    const text = addNode(again, { parentId: frame.id, type: 'text', name: '自检标题', x: 24, y: 24, w: 300, h: 80, text: 'MCP 文本', fontSize: 32, fontWeight: 700, letterSpacing: 2, paragraphSpacing: 8, listStyle: 'bullet' });
    updateNode(again, text.id, {
      effects: [
        { type: 'drop-shadow', x: 0, y: 8, blur: 16, color: '#221C00', opacity: 0.4, visible: true },
        { type: 'layer-blur', blur: 2, visible: true },
      ],
      prototype: { targetId: frame.id },
    });
    if (again.nodes[text.id].prototype?.targetId !== frame.id) throw new Error('原型目标未写入');
    let prototypeRejected = false;
    try {
      updateNode(again, text.id, { prototype: { targetId: text.id } });
    } catch {
      prototypeRejected = true;
    }
    if (!prototypeRejected) throw new Error('原型目标未拒绝非画板');
    writeScene(created.id, again);
    const withText = readScene(created.id);
    const savedText = withText.nodes[text.id];
    if (!savedText || savedText.text !== 'MCP 文本' || savedText.effects.length !== 2) throw new Error('文本或效果未落盘');
    if (savedText.prototype?.targetId !== frame.id) throw new Error('原型目标未落盘');
    if (savedText.letterSpacing !== 2 || savedText.listStyle !== 'bullet') throw new Error('文本样式未落盘');
    const listed = listNodes(withText, { type: 'text', query: 'MCP' });
    if (!listed.nodes.some((n) => n.id === text.id)) throw new Error('节点列表过滤失败');
    const reorder = reorderNode(withText, text.id, 'back');
    if (reorder.index !== 0) throw new Error('图层重排未生效');
    const second = addPage(withText, { name: '自检第二页', frameName: '第二页画板', w: 800, h: 600 });
    if (withText.pages.length !== 2 || !withText.nodes[second.frame.id]) throw new Error('新增页面或默认画板失败');
    writeScene(created.id, withText);

    const clone = duplicateFrame(again, frame.id);
    const parent = again.nodes[clone.parentId];
    const sourceIndex = parent.children.indexOf(frame.id);
    if (parent.children[sourceIndex + 1] !== clone.id) throw new Error('复制画板没有插到源画板后面');
    writeScene(created.id, again);
    const duplicated = readScene(created.id);
    if (!duplicated.nodes[clone.id]) throw new Error('复制画板未落盘');

    deleteNode(duplicated, clone.id);
    writeScene(created.id, duplicated);
    const afterDelete = readScene(created.id);
    if (afterDelete.nodes[clone.id]) throw new Error('删除画板未落盘');
    if (afterDelete.nodes[afterDelete.pages[0].rootId].children.includes(clone.id)) {
      throw new Error('删除画板后父节点仍保留引用');
    }

    const grid = addFrameGrid(afterDelete, {
      rows: 2,
      cols: 3,
      w: 640,
      h: 480,
      gapX: 40,
      gapY: 40,
      namePrefix: '压测',
    });
    if (grid.count !== 6 || afterDelete.nodes[grid.ids[5]].x !== 1360) throw new Error('画板网格生成错误');
    const batch = updateNodes(afterDelete, [
      { nodeId: grid.ids[0], patch: { x: 10, name: '批量改名 A' } },
      { nodeId: grid.ids[1], patch: { y: 30 } },
    ]);
    if (batch[0].x !== 10 || batch[0].name !== '批量改名 A' || batch[1].y !== 30) throw new Error('批量修改未生效');
    const pageConfig = updatePageConfig(afterDelete, {
      pageId: afterDelete.pages[0].id,
      name: '压测页',
      background: '#101010',
    });
    if (pageConfig.name !== '压测页' || pageConfig.background !== '#101010') throw new Error('页面修改未生效');
    writeScene(created.id, afterDelete);
    const gridSaved = readScene(created.id);
    if (!gridSaved.nodes[grid.ids[0]] || gridSaved.nodes[grid.ids[0]].x !== 10) throw new Error('批量修改未落盘');
    if (gridSaved.pages[0].background !== '#101010') throw new Error('页面背景未落盘');

    const snaps = fs.readdirSync(path.join(projectDir(created.id), 'snapshots'));
    if (!snaps.length) throw new Error('没有生成写前快照');

    const summary = summaryOf(created.id);
    if (summary.frames !== 8) throw new Error('摘要画板数错误');

    const dry = createProject({ name: '不应写盘', dryRun: true });
    if (fs.existsSync(dry.dir)) throw new Error('dryRun 竟然写了盘');

    const listing = listProjects();
    if (!listing.some((p) => p.id === created.id)) throw new Error('工程列表缺失');

    const defaultScene = createDefaultDoc('模板');
    if (!defaultScene.nodes['frame-1']) throw new Error('默认模板缺少画板');

    console.error(`selftest ok · root=${tmp} · project=${created.id} · frames=${summary.frames} · snapshots=${snaps.length}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv.includes('--selftest')) {
  selftest().catch((err) => {
    console.error('selftest failed:', err);
    process.exit(1);
  });
} else {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Groma MCP ${VERSION} ready · root=${rootDir()}`);
}
