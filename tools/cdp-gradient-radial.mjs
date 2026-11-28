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
  const centerOf = (selector) => evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  const drag = async (from, to) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y: from.y, button: 'none', buttons: 0 });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 8; i += 1) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x + ((to.x - from.x) * i) / 8, y: from.y + ((to.y - from.y) * i) / 8, button: 'left', buttons: 1 });
      await sleep(20);
    }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(250);
  };
  const fields = () => evaluate(`(() => {
    const field = (label) => [...document.querySelectorAll('.field')].find((el) => el.querySelector('.field-label')?.textContent.trim() === label)?.querySelector('input')?.value ?? null;
    const handle = (name) => {
      const el = document.querySelector('[data-gradient-handle="' + name + '"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round((r.left + r.width / 2) * 10) / 10, y: Math.round((r.top + r.height / 2) * 10) / 10 };
    };
    return { cx: field('X'), cy: field('Y'), r: field('R'), center: handle('center'), radius: handle('radius') };
  })()`);

  await send('Runtime.enable');
  await send('Page.enable');
  await sleep(900);
  await evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((el) => el.querySelector('.layer-name')?.textContent.trim() === '天气图标');
    row?.querySelector('.layer-caret')?.click();
  })()`);
  await sleep(350);
  await evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((el) => el.querySelector('.layer-name')?.textContent.trim() === '太阳');
    row?.click();
  })()`);
  await sleep(650);
  const before = await fields();
  const center = await centerOf('[data-gradient-handle="center"]');
  const radius = await centerOf('[data-gradient-handle="radius"]');
  if (!center || !radius) throw new Error('径向渐变手柄没有出现');
  await drag(center, { x: center.x + 32, y: center.y + 20 });
  const afterCenter = await fields();
  const radius2 = await centerOf('[data-gradient-handle="radius"]');
  if (!radius2) throw new Error('半径手柄消失');
  await drag(radius2, { x: radius2.x + 35, y: radius2.y });
  const afterRadius = await fields();
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync('shots/gradient-radial.png', Buffer.from(shot.data, 'base64'));
  console.log('RADIAL_BEFORE', JSON.stringify(before));
  console.log('RADIAL_CENTER', JSON.stringify(afterCenter));
  console.log('RADIAL_RADIUS', JSON.stringify(afterRadius));
  ws.close();
}

main().catch((error) => { console.error(error); process.exit(1); });
