import { execSync } from 'node:child_process';
import { existsSync, statSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const exe = join(root, 'src-tauri', 'target', 'release', 'groma.exe');

function run(label, command) {
  process.stdout.write(`\n▶ ${label}\n`);
  execSync(command, { cwd: root, stdio: 'inherit' });
}

function latestSourceTime() {
  let latest = 0;
  const roots = ['src', 'src-tauri/src', 'tools', 'mcp'];
  for (const dir of roots) {
    const full = join(root, dir);
    if (!existsSync(full)) continue;
    for (const entry of readdirSync(full, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (!/\.(ts|tsx|css|rs|mjs|html)$/.test(entry.name)) continue;
      const path = join(entry.parentPath ?? entry.path, entry.name);
      latest = Math.max(latest, statSync(path).mtimeMs);
    }
  }
  for (const file of ['index.html', 'package.json', 'vite.config.ts']) {
    const path = join(root, file);
    if (existsSync(path)) latest = Math.max(latest, statSync(path).mtimeMs);
  }
  return latest;
}

run('单元测试', 'npm test');
run('前端构建', 'npm run build');
run('MCP 往返自检', 'npm run mcp:check');
run('编译 EXE', 'npx tauri build --no-bundle');

if (!existsSync(exe)) {
  console.error('\n✗ 找不到 groma.exe');
  process.exit(1);
}
const exeTime = statSync(exe).mtimeMs;
const sourceTime = latestSourceTime();
if (exeTime < sourceTime) {
  console.error('\n✗ exe 比源码旧，交付会重演 Reelix 的旧壳问题');
  console.error(`  exe: ${new Date(exeTime).toLocaleString()}`);
  console.error(`  源码: ${new Date(sourceTime).toLocaleString()}`);
  process.exit(1);
}

console.log('\n✓ GATE PASS');
console.log(`  exe: ${exe}`);
console.log(`  体积: ${(statSync(exe).size / 1024).toFixed(0)} KB`);
console.log(`  时间: ${new Date(exeTime).toLocaleString()}`);
