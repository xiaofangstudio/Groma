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

  async function draw(label, x1, y1, x2, y2) {
    const clicked = await evaluate(`(() => {
      const button = document.querySelector('[aria-label="${label}"]');
      if (!button) return false;
      button.click();
      return true;
    })()`);
    if (!clicked) throw new Error(`没有${label}按钮`);
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
    await sleep(600);
    return evaluate(`document.querySelector('.right-panel .inspector-scroll')?.innerText.slice(0, 300)`);
  }

  const polygonInspector = await draw('多边形工具', 0.52, 0.40, 0.68, 0.56);
  const starInspector = await draw('星形工具', 0.52, 0.58, 0.68, 0.74);

  async function setField(labelText, value) {
    const result = await evaluate(`(() => {
      const field = [...document.querySelectorAll('.right-panel label.field')]
        .find((item) => item.querySelector('.field-label')?.textContent === '${labelText}');
      const input = field?.querySelector('input');
      if (!input) return 'missing';
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, '${value}');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      return input.value;
    })()`);
    await sleep(500);
    return result;
  }

  await setField('内径%', 55);
  const starAfter = await evaluate(`document.querySelector('.right-panel .inspector-scroll')?.innerText.slice(0, 360)`);
  const polygonSelected = await evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((item) => item.textContent.includes('多边形 1'));
    if (!row) return false;
    row.click();
    return true;
  })()`);
  if (!polygonSelected) throw new Error('无法选中多边形');
  await sleep(400);
  await setField('边数', 8);
  const polygonAfter = await evaluate(`document.querySelector('.right-panel .inspector-scroll')?.innerText.slice(0, 360)`);
  await evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((item) => item.textContent.includes('星形 1'));
    row?.click();
    return true;
  })()`);
  await sleep(350);
  const state = await evaluate(`(() => ({
    active: document.querySelector('[aria-label="星形工具"]')?.className,
    layers: [...document.querySelectorAll('.layer-row')].map((item) => item.innerText.trim()).slice(0, 14),
    inspector: document.querySelector('.right-panel .inspector-scroll')?.innerText.slice(0, 360),
    topbar: document.querySelector('.topbar')?.innerText.slice(0, 120)
  }))()`);
  console.log('POLYGON', JSON.stringify(polygonInspector));
  console.log('STAR', JSON.stringify(starInspector));
  console.log('STAR_AFTER', JSON.stringify(starAfter));
  console.log('POLYGON_AFTER', JSON.stringify(polygonAfter));
  console.log('STATE', JSON.stringify(state));

  await evaluate(`(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
    return 'save';
  })()`);
  await sleep(1400);
  console.log('SAVED');
  ws.close();
}

main().catch((error) => { console.error('CDP ERROR', error.message); process.exitCode = 1; });
