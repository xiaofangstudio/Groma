const port = process.env.CDP_PORT || '9222';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = targets.find((t) => t.type === 'page' && /tauri|127\.0\.0\.1|localhost/.test(t.url)) ?? targets.find((t) => t.type === 'page');
  if (!page) throw new Error('没有找到 Groma 页面');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let seq = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (!msg.id) return;
    const slot = pending.get(msg.id);
    if (!slot) return;
    pending.delete(msg.id);
    if (msg.error) slot.reject(new Error(msg.error.message));
    else slot.resolve(msg.result);
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
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
  const activated = await evaluate(`(() => {
    const button = document.querySelector('[aria-label="直线工具"]');
    if (!button) return 'no button';
    button.click();
    return button.getAttribute('title') || 'line';
  })()`);
  await sleep(250);
  const box = await evaluate(`(() => {
    const canvas = document.querySelector('.canvas-host canvas');
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height, active: document.querySelector('[aria-label="直线工具"]')?.className };
  })()`);
  if (!box) throw new Error('没有画布');
  const sx = box.left + Math.round(box.width * 0.28);
  const sy = box.top + Math.round(box.height * 0.32);
  const ex = box.left + Math.round(box.width * 0.62);
  const ey = box.top + Math.round(box.height * 0.58);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sx, y: sy });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: sx, y: sy, button: 'left', buttons: 1, clickCount: 1 });
  for (let i = 1; i <= 10; i += 1) {
    await send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: Math.round(sx + ((ex - sx) * i) / 10),
      y: Math.round(sy + ((ey - sy) * i) / 10),
      button: 'left',
      buttons: 1,
    });
    await sleep(30);
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: ex, y: ey, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(700);

  const state = await evaluate(`(() => ({
    active: document.querySelector('[aria-label="直线工具"]')?.className,
    layers: [...document.querySelectorAll('.layer-row')].map((item) => item.innerText.trim()).slice(0, 12),
    inspector: document.querySelector('.right-panel .inspector-scroll')?.innerText.slice(0, 420),
    tool: document.querySelector('.topbar')?.innerText.slice(0, 120)
  }))()`);
  console.log('ACTIVATED', activated);
  console.log('BOX', JSON.stringify(box));
  console.log('DRAG', sx, sy, ex, ey);
  console.log('STATE', JSON.stringify(state));

  await evaluate(`(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
    return 'save';
  })()`);
  await sleep(1400);
  console.log('SAVED');
  ws.close();
}

main().catch((error) => {
  console.error('CDP ERROR', error.message);
  process.exitCode = 1;
});
