import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const home = os.homedir();
const source = path.join(home, 'Documents', 'Groma', 'P0.groma');
const target = path.join(home, 'Documents', 'Groma', 'LiveComponent.groma');
if (existsSync(target)) rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(path.join(source, 'assets'), path.join(target, 'assets'), { recursive: true });
mkdirSync(path.join(target, 'snapshots'), { recursive: true });

const scene = JSON.parse(readFileSync(path.join(source, 'scene.json'), 'utf8'));
const masterId = 'frame-mx013ysx-8';
const instanceId = 'frame-mx013zz7-10';
const keep = new Set(['root-p0', masterId, instanceId]);
const master = scene.nodes[masterId];
for (const childId of master.children) keep.add(childId);
const instance = scene.nodes[instanceId];
for (const childId of instance.children) keep.add(childId);

const nodes = {};
for (const id of keep) {
  if (scene.nodes[id]) nodes[id] = scene.nodes[id];
}
nodes['root-p0'] = {
  ...nodes['root-p0'],
  name: '组件联动画板',
  children: [masterId, instanceId],
};
nodes[masterId] = {
  ...nodes[masterId],
  name: '状态标签主组件',
  x: 80,
  y: 80,
  librarySource: undefined,
  libraryPublication: undefined,
};
nodes[instanceId] = {
  ...nodes[instanceId],
  name: '状态标签实例',
  x: 80,
  y: 220,
};
for (const childId of master.children) {
  if (nodes[childId]) nodes[childId] = { ...nodes[childId], text: '状态标签' };
}
for (const childId of instance.children) {
  if (nodes[childId]) nodes[childId] = { ...nodes[childId], text: '状态标签' };
}

const doc = {
  ...scene,
  name: '组件联动',
  nodes,
  pages: [{ ...scene.pages[0], name: '组件联动', background: '#F7F5EF' }],
};
writeFileSync(path.join(target, 'scene.json'), JSON.stringify(doc, null, 2));
writeFileSync(
  path.join(target, 'project.json'),
  JSON.stringify(
    {
      format: 'groma',
      formatVersion: 1,
      name: '组件联动',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    null,
    2,
  ),
);
console.log(`WROTE ${target}`);
