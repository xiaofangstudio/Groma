import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const projectRoot = 'D:/20533/deskbox/fangwork/Groma';
const scenePath = path.join(projectRoot, '.acceptance', 'mask-alpha.groma', 'scene.json');
const outPath = path.join(projectRoot, 'shots', 'alpha-headless.png');
const chromePath = path.join(process.env.LOCALAPPDATA, 'ms-playwright', 'chromium-901522', 'chrome-win', 'chrome.exe');
const port = 9338;
const profile = path.join(projectRoot, '.acceptance', 'chrome-profile');
const sceneText = fs.readFileSync(scenePath, 'utf8');
fs.mkdirSync(path.dirname(outPath), { recursive: true });

const chrome = spawn(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--window-size=1440,900',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitTargets() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch {}
    await sleep(200);
  }
  throw new Error('headless Chromium 没有启动');
}

const page = await waitTargets();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let seq = 0;
const pending = new Map();
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (!msg.id) return;
  const slot = pending.get(msg.id);
  if (!slot) return;
  pending.delete(msg.id);
  if (msg.error) slot.reject(new Error(msg.error.message)); else slot.resolve(msg.result);
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
  return res.result?.value;
};

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
const mock = `(() => {
  const scene = ${JSON.stringify(sceneText)};
  const noop = () => {};
  let callbackId = 1000;
  window.__TAURI_INTERNALS__ = {
    transformCallback(callback) {
      const id = callbackId++;
      window['_' + id] = callback;
      return id;
    },
    unregisterCallback(id) { delete window['_' + id]; },
    convertFileSrc(filePath) { return filePath; },
    async invoke(cmd, args) {
      if (cmd === 'launch_mode') return { mode: 'open', projectId: 'mask-alpha' };
      if (cmd === 'groma_list_projects') return [];
      if (cmd === 'groma_load_project') return scene;
      if (cmd === 'groma_save_project') return null;
      if (cmd === 'groma_list_snapshots') return [];
      if (cmd === 'groma_load_settings') return null;
      if (cmd === 'plugin:event|listen') return 1;
      if (cmd === 'plugin:event|unlisten') return null;
      return null;
    }
  };
  const originalError = console.error;
  console.error = (...args) => { window.__mockErrors = [...(window.__mockErrors || []), args.join(' ')]; originalError(...args); };
  localStorage.clear();
  noop();
})();`;
await send('Page.addScriptToEvaluateOnNewDocument', { source: mock });
await send('Page.navigate', { url: 'http://127.0.0.1:4173/' });
await sleep(2200);
console.log('PHASE', await evaluate(`document.body.innerText.slice(0, 240)`));
console.log('ERRORS', await evaluate(`JSON.stringify(window.__mockErrors || [])`));

const opened = await evaluate(`(() => {
  const fit = document.querySelector('[aria-label="适应画板"]');
  fit?.click();
  const frame = [...document.querySelectorAll('.layer-row')].find((row) => row.innerText.includes('桌面 1440'));
  frame?.querySelector('.layer-caret')?.click();
  return { fit: Boolean(fit), frame: Boolean(frame), error: document.querySelector('.app-error')?.innerText ?? '' };
})()`);
console.log('OPENED', JSON.stringify(opened));
await sleep(500);
const selected = await evaluate(`(() => {
  const row = [...document.querySelectorAll('.layer-row')].find((item) => item.innerText.includes('椭圆蒙版'));
  row?.click();
  return { selected: Boolean(row), rows: [...document.querySelectorAll('.layer-row')].map((r) => r.innerText.trim()).slice(0, 20) };
})()`);
console.log('SELECTED', JSON.stringify(selected));
await sleep(800);
console.log('MASKUI', await evaluate(`JSON.stringify({
  typeSwitch: [...document.querySelectorAll('.mask-type-switch .fill-type-btn')].map((b) => ({ text: b.innerText.trim(), on: b.classList.contains('is-on') })),
  hint: document.querySelector('.mask-hint')?.innerText.trim() ?? '',
  error: document.querySelector('.app-error')?.innerText ?? ''
})`));

const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
fs.writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
console.log('SAVED', outPath, fs.statSync(outPath).size);
ws.close();
chrome.kill();
