import fs from 'node:fs';
import path from 'node:path';

const root = path.join(process.env.USERPROFILE, 'Documents', 'Groma');
const source = path.join(root, 'alpha-demo.groma');
const target = process.env.LUMA_TARGET || path.join(root, 'luma-demo.groma');
fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true });
const projectPath = path.join(target, 'project.json');
const project = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
project.name = '亮度蒙版演示';
fs.writeFileSync(projectPath, JSON.stringify(project, null, 2));
const scenePath = path.join(target, 'scene.json');
const scene = JSON.parse(fs.readFileSync(scenePath, 'utf8'));
scene.name = '亮度蒙版演示';
const mask = scene.nodes['mask-shape'];
mask.maskType = 'luminance';
mask.fills = [{
  type: 'linear',
  color: '#000000',
  opacity: 1,
  x1: 0,
  y1: 200,
  x2: 500,
  y2: 200,
  stops: [
    { offset: 0, color: '#000000', opacity: 1 },
    { offset: 1, color: '#FFFFFF', opacity: 1 },
  ],
}];
scene.nodes['title-1'].text = '亮度蒙版 Luminance Mask';
scene.nodes['mask-label'].text = 'LUMA';
fs.writeFileSync(scenePath, JSON.stringify(scene), 'utf8');
console.log(target);
