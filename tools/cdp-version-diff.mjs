const port = process.env.CDP_PORT || '9241';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('没有找到 WebView2 页面');
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
  await sleep(3000);

  const opened = await evaluate(`(() => {
    const btn = document.querySelector('.version-btn');
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
  if (!opened) throw new Error('没有版本按钮');
  await sleep(600);
  const saved = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('.version-save')][0];
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
  await sleep(1400);
  const count1 = await evaluate(`(() => document.querySelectorAll('.version-row').length)`);
  console.log('SNAPSHOT', saved, count1);
  await evaluate(`(() => {
    const btn = [...document.querySelectorAll('.version-actions button')].find((b) => b.textContent.trim() === '关闭');
    btn?.click();
    return true;
  })()`);
  await sleep(500);

  const info = await evaluate(`(() => {
    const canvas = document.querySelector('canvas.canvas');
    const r = canvas?.getBoundingClientRect();
    const key = Object.keys(localStorage).find((k) => k.includes('Figma33'));
    const raw = key ? localStorage.getItem(key) : null;
    return { canvas: r ? { x: r.x, y: r.y } : null, raw };
  })()`);
  if (!info.canvas || !info.raw) throw new Error('没有 canvas 或 viewport');
  const parsed = JSON.parse(info.raw);
  const pageId = parsed.pageId || Object.keys(parsed.viewports)[0];
  const v = parsed.viewports[pageId];
  const sx = Math.round(info.canvas.x + v.x + 570 * v.scale);
  const sy = Math.round(info.canvas.y + v.y + 240 * v.scale);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sx, y: sy });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: sx, y: sy, button: 'left', buttons: 1, clickCount: 1 });
  for (let i = 1; i <= 8; i += 1) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sx + i * 4, y: sy, button: 'left', buttons: 1 });
    await sleep(35);
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: sx + 32, y: sy, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(1400);

  await evaluate(`document.querySelector('.version-btn')?.click()`);
  await sleep(700);
  const count2 = await evaluate(`(() => document.querySelectorAll('.version-row').length)`);
  const picked = await evaluate(`(() => {
    const rows = [...document.querySelectorAll('.version-row')];
    const row = rows[Math.min(1, rows.length - 1)];
    if (!row) return false;
    row.click();
    return true;
  })()`);
  await sleep(1200);
  const result = await evaluate(`(() => ({
    count: document.querySelectorAll('.version-row').length,
    title: document.querySelector('.version-detail-title')?.textContent ?? '',
    diff: document.querySelector('.version-diff')?.textContent ?? '',
    selected: document.querySelector('.version-row.is-selected .version-time')?.textContent ?? '',
  }))()`);
  console.log('DIFF', JSON.stringify({ count2, picked, ...result }));
  await evaluate(`(() => {
    const el = document.querySelector('.version-diff');
    el?.scrollIntoView({ block: 'center' });
    return true;
  })()`);
  await sleep(300);
  ws.close();
}
main().catch((error) => { console.error(error); process.exit(1); });
