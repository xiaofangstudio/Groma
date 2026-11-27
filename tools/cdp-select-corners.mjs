const port = process.env.CDP_PORT || '9239';
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
  await sleep(3200);

  const info = await evaluate(`(() => {
    const canvas = document.querySelector('canvas.canvas');
    const r = canvas?.getBoundingClientRect();
    const key = Object.keys(localStorage).find((k) => k.includes('Corners'));
    const raw = key ? localStorage.getItem(key) : null;
    return { canvas: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null, raw };
  })()`);
  if (!info.canvas || !info.raw) throw new Error('没有 canvas 或 viewport');
  const parsed = JSON.parse(info.raw);
  const pageId = parsed.pageId || Object.keys(parsed.viewports)[0];
  const v = parsed.viewports[pageId];
  const sx = Math.round(info.canvas.x + 20 + v.x + 500 * v.scale);
  const sy = Math.round(info.canvas.y + 20 + v.y + 310 * v.scale);
  console.log('VIEW', JSON.stringify(v), 'CLICK', sx, sy);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sx, y: sy });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: sx, y: sy, button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: sx, y: sy, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(900);
  const result = await evaluate(`(() => ({
    title: document.querySelector('.inspector-sel')?.textContent ?? '',
    labels: [...document.querySelectorAll('.ins-section .num-field-label')].map((el) => el.textContent).filter(Boolean).slice(0, 12),
    zoom: document.querySelector('.zoom-value')?.textContent ?? '',
  }))()`);
  console.log('SELECT', JSON.stringify(result));
  ws.close();
}
main().catch((error) => { console.error(error); process.exit(1); });
