import fs from 'node:fs';
import path from 'node:path';

const root = path.join(process.env.USERPROFILE, 'Documents', 'Groma');
const source = path.join(root, 'mask-demo.groma');
const target = process.env.ALPHA_TARGET || path.join(root, 'mask-alpha.groma');
fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true });
const projectPath = path.join(target, 'project.json');
const project = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
project.name = 'Alpha 蒙版演示';
fs.writeFileSync(projectPath, JSON.stringify(project, null, 2));

const scenePath = path.join(target, 'scene.json');
const scene = JSON.parse(fs.readFileSync(scenePath, 'utf8'));
scene.name = 'Alpha 蒙版演示';
const mask = scene.nodes['mask-shape'];
mask.isMask = true;
mask.maskType = 'alpha';
mask.fills = [
  {
    type: 'linear',
    color: '#221C00',
    opacity: 1,
    x1: 0,
    y1: 0.5,
    x2: 1,
    y2: 0.5,
    stops: [
      { offset: 0, color: '#221C00', opacity: 1 },
      { offset: 0.55, color: '#221C00', opacity: 1 },
      { offset: 1, color: '#221C00', opacity: 0 },
    ],
  },
];
scene.nodes['title-1'].text = 'Alpha 蒙版 Alpha Mask';
scene.nodes['mask-label'].text = 'ALPHA';
fs.writeFileSync(scenePath, JSON.stringify(scene), 'utf8');
console.log(target);
