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
  await sleep(350);
  const box = await evaluate(`(() => {
    const canvas = document.querySelector('.canvas-host canvas');
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  })()`);
  if (!box) throw new Error('没有画布');

  async function draw(x1, y1, x2, y2) {
    const clicked = await evaluate(`(() => {
      const button = document.querySelector('[aria-label="箭头工具"]');
      if (!button) return false;
      button.click();
      return true;
    })()`);
    if (!clicked) throw new Error('没有箭头工具按钮');
    await sleep(250);
    const sx = Math.round(box.left + box.width * x1);
    const sy = Math.round(box.top + box.height * y1);
    const ex = Math.round(box.left + box.width * x2);
    const ey = Math.round(box.top + box.height * y2);
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
    await sleep(650);
  }

  const clicked = await evaluate(`(() => {
    const button = document.querySelector('[aria-label="箭头工具"]');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (!clicked) throw new Error('没有箭头工具按钮');
  await sleep(300);
  await draw(0.55, 0.38, 0.77, 0.48);
  await draw(0.52, 0.62, 0.72, 0.60);

  const state = await evaluate(`(() => ({
    layers: [...document.querySelectorAll('.layer-row')].map((item) => item.innerText.trim()).slice(0, 14),
    inspector: document.querySelector('.right-panel .inspector-scroll')?.innerText.slice(0, 300),
    toolbar: [...document.querySelectorAll('.tool-btn')].map((item) => item.getAttribute('aria-label'))
  }))()`);
  console.log(JSON.stringify(state));

  await evaluate(`(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
    return 'save';
  })()`);
  await sleep(1500);
  console.log('SAVED');
  ws.close();
}

main().catch((error) => { console.error('CDP ERROR', error.message); process.exitCode = 1; });
