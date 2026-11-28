import fs from 'node:fs';
const port = process.env.CDP_PORT || '9241';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = targets.find((t) => t.type === 'page');
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
  await sleep(800);
  const box = await evaluate(`(() => {
    const canvas = document.querySelector('.canvas-host canvas.canvas');
    const r = canvas.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  })()`);
  const mouse = (type, x, y, buttons = 1) => send('Input.dispatchMouseEvent', {
    type, x: Math.round(x), y: Math.round(y), button: 'left', buttons, clickCount: 1,
  });
  async function drag(x1, y1, x2, y2) {
    await mouse('mouseMoved', x1, y1, 0);
    await mouse('mousePressed', x1, y1, 1);
    for (let i = 1; i <= 10; i += 1) {
      await mouse('mouseMoved', x1 + ((x2 - x1) * i) / 10, y1 + ((y2 - y1) * i) / 10, 1);
      await sleep(25);
    }
    await mouse('mouseReleased', x2, y2, 0);
    await sleep(400);
  }
  const tool = async (label) => {
    await evaluate(`document.querySelector('[aria-label="${label}"]')?.click()`);
    await sleep(220);
  };
  const c = { x: box.left + box.width * 0.5, y: box.top + box.height * 0.55 };

  await tool('矩形工具');
  await drag(c.x - 180, c.y - 30, c.x - 60, c.y + 50);
  await tool('矩形工具');
  await drag(c.x + 80, c.y + 110, c.x + 200, c.y + 190);
  await tool('移动工具');

  // 拖第二个矩形，靠近第一个的顶边/中心；按住鼠标截屏，让参考线留在画面上。
  const startX = c.x + 140;
  const startY = c.y + 150;
  const endX = c.x + 140;
  const endY = c.y + 55;
  await mouse('mouseMoved', startX, startY, 0);
  await mouse('mousePressed', startX, startY, 1);
  for (let i = 1; i <= 18; i += 1) {
    await mouse('mouseMoved', startX + ((endX - startX) * i) / 18, startY + ((endY - startY) * i) / 18, 1);
    await sleep(30);
  }
  await sleep(350);
  const guides = await evaluate(`(() => [...document.querySelectorAll('.smart-guide')].map((el) => ({ cls: el.className, bg: getComputedStyle(el).background, w: el.clientWidth, h: el.clientHeight })))()`);
  const marks = await evaluate(`(() => [...document.querySelectorAll('.snap-mark')].map((el) => ({ cls: el.className, left: Math.round(el.getBoundingClientRect().left), top: Math.round(el.getBoundingClientRect().top) })))()`);
  console.log('SMART_GUIDES', JSON.stringify(guides));
  console.log('SNAP_MARKS', JSON.stringify(marks));
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync('shots/canvas-smart-guides.png', Buffer.from(shot.data, 'base64'));
  await mouse('mouseReleased', endX, endY, 0);
  ws.close();
}
main().catch((error) => { console.error('FAILED', error); process.exit(1); });
