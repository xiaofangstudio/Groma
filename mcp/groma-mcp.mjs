#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  addFrame,
  createDefaultDoc,
  createProject,
  deleteNode,
  duplicateFrame,
  listProjects,
  projectDir,
  readScene,
  rootDir,
  summaryOf,
  updateNode,
  writeScene,
} from './lib/store.mjs';

const VERSION = '0.1.0';

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

const server = new McpServer({ name: 'groma', version: VERSION });

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
  'groma_update_node',
  {
    title: '修改节点属性',
    description:
      '修改画板的位置、尺寸、圆角、透明度、显隐、锁定、名称或纯色填充。默认 dryRun=true；false 时写盘并保留快照。',
    inputSchema: z.object({
      id: z.string(),
      nodeId: z.string(),
      name: z.string().optional(),
      x: z.number().optional(),
      y: z.number().optional(),
      w: z.number().positive().optional(),
      h: z.number().positive().optional(),
      cornerRadius: z.number().min(0).optional(),
      opacity: z.number().min(0).max(1).optional(),
      visible: z.boolean().optional(),
      locked: z.boolean().optional(),
      fillColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
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

    updateNode(loaded, frame.id, { x: 120, fillColor: '#F2B705', opacity: 0.8 });
    writeScene(created.id, loaded);
    const again = readScene(created.id);
    const node = again.nodes[frame.id];
    if (node.x !== 120 || node.fills[0].color !== '#F2B705') throw new Error('节点更新未生效');

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

    const snaps = fs.readdirSync(path.join(projectDir(created.id), 'snapshots'));
    if (!snaps.length) throw new Error('没有生成写前快照');

    const summary = summaryOf(created.id);
    if (summary.frames !== 2) throw new Error('摘要画板数错误');

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
