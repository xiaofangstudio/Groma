import fs from 'node:fs';

const port = process.env.CDP_PORT || '9248';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = targets.find((t) => t.type === 'page' && /tauri|127\.0\.0\.1|localhost/.test(t.url)) ?? targets.find((t) => t.type === 'page');
  if (!page) throw new Error('没有 Groma 页面');
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
    msg.error ? slot.reject(new Error(msg.error.message)) : slot.resolve(msg.result);
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
  const shot = async (path) => {
    const result = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync(path, Buffer.from(result.data, 'base64'));
  };
  const state = () => evaluate(`(() => ({
    selected: [...document.querySelectorAll('.layer-row.is-selected .layer-name')].map((el) => el.textContent.trim()),
    selectedRows: document.querySelectorAll('.layer-row.is-selected').length,
    bar: document.querySelector('.boolean-bar')?.textContent.trim() ?? null,
    barButtons: [...document.querySelectorAll('.boolean-bar-item')].map((el) => el.textContent.trim()),
    topLabel: [...document.querySelectorAll('.bool-btn')].map((el) => el.textContent.trim()),
    toast: document.querySelector('.toast strong')?.textContent.trim() ?? null,
    layerNames: [...document.querySelectorAll('.layer-row .layer-name')].map((el) => el.textContent.trim()).slice(0, 16),
  }))()`);

  await send('Runtime.enable');
  await send('Page.enable');
  await sleep(900);
  await evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((el) => el.querySelector('.layer-name')?.textContent.trim() === '天气图标');
    row?.querySelector('.layer-caret')?.click();
  })()`);
  await sleep(350);
  await evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((el) => el.querySelector('.layer-name')?.textContent.trim() === '玻璃卡');
    row?.click();
  })()`);
  await sleep(180);
  await evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((el) => el.querySelector('.layer-name')?.textContent.trim() === '太阳');
    row?.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
  })()`);
  await sleep(500);
  const before = await state();
  if (before.selectedRows !== 2) throw new Error(`多选失败：${JSON.stringify(before.selected)}`);
  if (!before.bar) throw new Error('布尔快捷条没有出现');
  if (!before.barButtons.includes('并集')) throw new Error(`布尔按钮不完整：${before.barButtons.join('/')}`);
  await shot('shots/boolean-bar.png');

  await evaluate(`(() => {
    const btn = [...document.querySelectorAll('.boolean-bar-item')].find((el) => el.textContent.trim() === '差集');
    btn?.click();
  })()`);
  await sleep(550);
  const after = await state();
  if (after.selectedRows !== 1) throw new Error(`合并后没有收成单层：${JSON.stringify(after.selected)}`);
  if (after.selected[0] !== '差集 1') throw new Error(`结果命名不对：${after.selected[0]}`);
  await shot('shots/boolean-result.png');

  await evaluate(`(() => {
    document.querySelector('[aria-label="撤销"]')?.click();
  })()`);
  await sleep(400);
  const undone = await state();

  console.log('BEFORE', JSON.stringify(before));
  console.log('AFTER', JSON.stringify(after));
  console.log('UNDO', JSON.stringify(undone));
  ws.close();
}

main().catch((error) => { console.error(error); process.exit(1); });
