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
  await sleep(3000);
  const info = await evaluate(`(() => {
    const canvas = document.querySelector('canvas.canvas');
    const r = canvas?.getBoundingClientRect();
    const key = Object.keys(localStorage).find((k) => k.includes('Figma33'));
    const raw = key ? localStorage.getItem(key) : null;
    return { canvas: r ? { x: r.x, y: r.y } : null, raw };
  })()`);
  const parsed = JSON.parse(info.raw);
  const pageId = parsed.pageId || Object.keys(parsed.viewports)[0];
  const v = parsed.viewports[pageId];
  const sx = Math.round(info.canvas.x + v.x + 570 * v.scale);
  const sy = Math.round(info.canvas.y + v.y + 240 * v.scale);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', {
      type, x: sx, y: sy,
      ...(type === 'mouseMoved' ? {} : { button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 }),
    });
  }
  await sleep(900);
  const rect = await evaluate(`(() => {
    const sec = [...document.querySelectorAll('.ins-section')].find((s) => s.querySelector('.ins-title')?.textContent === '代码');
    const btn = sec ? [...sec.querySelectorAll('button')].find((b) => b.textContent.includes('复制 CSS')) : null;
    if (!btn) return null;
    btn.scrollIntoView({ block: 'center' });
    const r = btn.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  if (!rect) throw new Error('没有复制 CSS 按钮');
  await sleep(200);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', {
      type, x: rect.x, y: rect.y,
      ...(type === 'mouseMoved' ? {} : { button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 }),
    });
  }
  await sleep(180);
  const label = await evaluate(`(() => {
    const sec = [...document.querySelectorAll('.ins-section')].find((s) => s.querySelector('.ins-title')?.textContent === '代码');
    return sec ? sec.querySelector('button')?.textContent ?? '' : '';
  })()`);
  console.log('TRUSTED_COPY', JSON.stringify({ label }));
  ws.close();
}
main().catch((error) => { console.error(error); process.exit(1); });
