import fs from 'node:fs';
const port = process.env.CDP_PORT || '9241';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = targets.find((t) => t.type === 'page' && /tauri|127\.0\.0\.1|localhost/.test(t.url)) ?? targets.find((t) => t.type === 'page');
  if (!page) throw new Error('没有找到 Groma 页面');
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
  const shoot = async (path) => {
    const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync(path, Buffer.from(shot.data, 'base64'));
    console.log('SHOT', path, fs.statSync(path).size);
  };

  await send('Runtime.enable');
  await sleep(900);

  const groups = await evaluate(`(() => [...document.querySelectorAll('.tool-split')].map((el) => {
    const main = el.querySelector('.tool-split-main');
    const caret = el.querySelector('.tool-split-caret');
    const triangle = el.querySelector('.tool-caret');
    const tr = triangle?.getBoundingClientRect();
    return {
      main: main?.getAttribute('aria-label'),
      caret: caret?.getAttribute('aria-label'),
      triangle: Boolean(triangle),
      triangleW: tr ? Math.round(tr.width) : 0,
      triangleH: tr ? Math.round(tr.height) : 0,
    };
  }))()`);
  console.log('TOOL_GROUPS', JSON.stringify(groups));

  await evaluate(`document.querySelector('[aria-label="形状菜单"]')?.click()`);
  await sleep(350);
  const shapeMenu = await evaluate(`(() => [...document.querySelectorAll('.tool-menu-shape [role="menuitem"]')].map((el) => ({ text: el.innerText.replace(/\\s+/g, ' ').trim(), tool: el.getAttribute('data-tool') })))()`);
  console.log('SHAPE_MENU', JSON.stringify(shapeMenu));
  await shoot('shots/toolbar-shape-menu.png');

  await evaluate(`document.querySelector('.tool-menu-shape [role="menuitem"][data-tool="ellipse"]')?.click()`);
  await sleep(400);
  const after = await evaluate(`(() => ({
    shapeMain: document.querySelector('[aria-label="形状菜单"]')?.parentElement?.querySelector('.tool-split-main')?.getAttribute('aria-label'),
    menuOpen: Boolean(document.querySelector('.tool-menu-shape')),
  }))()`);
  console.log('AFTER_ELLIPSE', JSON.stringify(after));
  await shoot('shots/toolbar-ellipse-active.png');
  ws.close();
}
main().catch((error) => { console.error('FAILED', error); process.exit(1); });
