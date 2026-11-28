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
    type, x: Math.round(x), y: Math.round(y), button: type === 'mouseReleased' ? 'left' : 'left', buttons, clickCount: 1,
  });
  async function drag(x1, y1, x2, y2) {
    await mouse('mouseMoved', x1, y1, 0);
    await mouse('mousePressed', x1, y1, 1);
    for (let i = 1; i <= 10; i += 1) {
      await mouse('mouseMoved', x1 + ((x2 - x1) * i) / 10, y1 + ((y2 - y1) * i) / 10, 1);
      await sleep(25);
    }
    await mouse('mouseReleased', x2, y2, 0);
    await sleep(450);
  }
  await evaluate(`document.querySelector('[aria-label="矩形工具"]')?.click()`);
  await sleep(250);
  const c = { x: box.left + box.width * 0.5, y: box.top + box.height * 0.55 };
  await drag(c.x - 150, c.y - 70, c.x - 50, c.y + 10);
  await evaluate(`document.querySelector('[aria-label="矩形工具"]')?.click()`);
  await sleep(250);
  await drag(c.x + 20, c.y - 70, c.x + 120, c.y + 10);
  await evaluate(`document.querySelector('[aria-label="移动工具"]')?.click()`);
  await sleep(250);
  await drag(c.x - 175, c.y - 95, c.x + 145, c.y + 35);
  await sleep(300);
  const selected = await evaluate(`(() => [...document.querySelectorAll('.layer-row.is-selected')].map((row) => row.innerText.replace(/\\s+/g, ' ').trim()))()`);
  await evaluate(`document.querySelector('[aria-label="布尔与矢量运算"]')?.click()`);
  await sleep(300);
  const menu = await evaluate(`(() => [...document.querySelectorAll('.bool-menu .bool-menu-item')].map((button) => ({ text: button.innerText.trim(), disabled: button.disabled, title: button.title })) )()`);
  const reason = await evaluate(`document.querySelector('.bool-menu-reason')?.textContent ?? ''`);
  console.log('BLANK_MARQUEE', JSON.stringify({ selected, reason, menu }));
  const topbar = await evaluate(`(() => {
    return {
      groups: [...document.querySelectorAll('.tool-split')].map((el) => ({
        main: el.querySelector('.tool-split-main')?.getAttribute('aria-label') ?? '',
        caret: el.querySelector('.tool-split-caret')?.getAttribute('aria-label') ?? '',
        triangle: Boolean(el.querySelector('.tool-caret')),
      })),
      bare: [...document.querySelectorAll('.topbar-tools > .tool-btn')].map((el) => el.getAttribute('aria-label')),
    };
  })()`);
  console.log('TOPBAR', JSON.stringify(topbar));
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync('shots/canvas-marquee-boolean.png', Buffer.from(shot.data, 'base64'));
  await evaluate(`(() => {
    const union = [...document.querySelectorAll('.bool-menu .bool-menu-item')].find((button) => button.textContent.trim() === '并集');
    union?.click();
    return Boolean(union);
  })()`);
  await sleep(700);
  const result = await evaluate(`(() => ({
    selected: [...document.querySelectorAll('.layer-row.is-selected')].map((row) => row.innerText.replace(/\\s+/g, ' ').trim()),
    type: document.querySelector('.type-chip')?.textContent ?? '',
  }))()`);
  console.log('BOOLEAN_RESULT', JSON.stringify(result));
  const resultShot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync('shots/canvas-boolean-result.png', Buffer.from(resultShot.data, 'base64'));
  ws.close();
}
main().catch((error) => { console.error('FAILED', error); process.exit(1); });
