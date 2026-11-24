const port = process.env.CDP_PORT || '9222';
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
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.text);
    return res.result?.value;
  };

  await send('Runtime.enable');
  await sleep(400);
  const box = await evaluate(`(() => {
    const canvas = document.querySelector('.canvas-host canvas');
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  })()`);
  if (!box) throw new Error('没有画布');

  const activated = await evaluate(`(() => {
    const button = document.querySelector('[aria-label="钢笔工具"]');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (!activated) throw new Error('没有钢笔工具按钮');
  await sleep(260);

  async function anchor(x, y, dx = 0, dy = 0) {
    const sx = Math.round(box.left + box.width * x);
    const sy = Math.round(box.top + box.height * y);
    const ex = Math.round(sx + box.width * dx);
    const ey = Math.round(sy + box.height * dy);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sx, y: sy });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: sx, y: sy, button: 'left', buttons: 1, clickCount: 1 });
    if (dx !== 0 || dy !== 0) {
      for (let i = 1; i <= 6; i += 1) {
        await send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: Math.round(sx + ((ex - sx) * i) / 6),
          y: Math.round(sy + ((ey - sy) * i) / 6),
          button: 'left',
          buttons: 1,
        });
        await sleep(22);
      }
    }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: ex, y: ey, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(260);
  }

  await anchor(0.405, 0.40, 0.02, -0.015);
  await anchor(0.52, 0.38, 0.02, -0.015);
  await anchor(0.56, 0.50, 0, 0.02);
  await anchor(0.49, 0.58, -0.02, 0.01);
  await anchor(0.37, 0.50, -0.02, 0);
  await anchor(0.405, 0.40);
  await sleep(350);

  await evaluate(`document.querySelector('[aria-label="钢笔工具"]')?.click()`);
  await sleep(260);
  await anchor(0.60, 0.42, 0.025, -0.015);
  await anchor(0.685, 0.40, 0.02, 0.015);
  await anchor(0.72, 0.52, -0.02, 0.015);
  await anchor(0.63, 0.57, -0.025, -0.01);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await sleep(500);

  await evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((item) => item.textContent.includes('钢笔 1'));
    if (row) row.click();
    return Boolean(row);
  })()`);
  await sleep(300);
  await evaluate(`document.querySelector('[aria-label="钢笔工具"]')?.click()`);
  await sleep(350);

  const created = await evaluate(`(() => ({
    layers: [...document.querySelectorAll('.layer-row')].map((item) => item.innerText.trim()).slice(0, 14),
    inspector: document.querySelector('.right-panel .inspector-scroll')?.innerText.slice(0, 460),
    active: document.querySelector('[aria-label="钢笔工具"]')?.className,
    status: document.querySelector('.statusbar')?.innerText.slice(0, 140),
    topbar: {
      left: Math.round(document.querySelector('.topbar-left')?.getBoundingClientRect().right ?? 0),
      tools: Math.round(document.querySelector('.topbar-tools')?.getBoundingClientRect().left ?? 0),
      name: document.querySelector('.doc-name')?.value
    }
  }))()`);
  console.log('CREATED', JSON.stringify(created));

  await send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: 2, key: 's', code: 'KeyS', windowsVirtualKeyCode: 83, nativeVirtualKeyCode: 83 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 2, key: 's', code: 'KeyS', windowsVirtualKeyCode: 83, nativeVirtualKeyCode: 83 });
  await sleep(1200);
  const saved = await evaluate(`(() => ({
    status: document.querySelector('.statusbar')?.innerText.slice(0, 140),
    toast: document.querySelector('.toast')?.innerText.slice(0, 180)
  }))()`);
  console.log('SAVED', JSON.stringify(saved));
  await evaluate(`document.querySelector('[aria-label="钢笔工具"]')?.click()`);
  await sleep(380);
  const overlay = await evaluate(`(() => ({
    anchors: document.querySelectorAll('.pen-overlay .pen-anchor').length,
    handles: document.querySelectorAll('.pen-overlay .pen-handle-dot').length,
    inspector: document.querySelector('.right-panel .inspector-scroll')?.innerText.slice(0, 220)
  }))()`);
  console.log('OVERLAY', JSON.stringify(overlay));

  ws.close();
}

main().catch((error) => { console.error('CDP ERROR', error.message); process.exit(1); });
