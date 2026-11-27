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
  const info = await evaluate(`(() => {
    const canvas = document.querySelector('canvas.canvas');
    const r = canvas?.getBoundingClientRect();
    const key = Object.keys(localStorage).find((k) => k.includes('Figma33'));
    const raw = key ? localStorage.getItem(key) : null;
    return { canvas: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null, raw };
  })()`);
  if (!info.canvas || !info.raw) throw new Error('没有 canvas 或 viewport');
  const parsed = JSON.parse(info.raw);
  const pageId = parsed.pageId || Object.keys(parsed.viewports)[0];
  const v = parsed.viewports[pageId];
  const sx = Math.round(info.canvas.x + v.x + 570 * v.scale);
  const sy = Math.round(info.canvas.y + v.y + 240 * v.scale);
  console.log('CLICK', sx, sy, JSON.stringify(v));
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', {
      type,
      x: sx,
      y: sy,
      ...(type === 'mouseMoved' ? {} : { button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 }),
    });
  }
  await sleep(800);
  const before = await evaluate(`(() => ({
    title: document.querySelector('.inspector-sel')?.textContent ?? '',
    styleButton: [...document.querySelectorAll('button')].find((b) => b.textContent.includes('复制 CSS'))?.textContent ?? '',
    styleText: [...document.querySelectorAll('.ins-section')].find((s) => s.querySelector('.ins-title')?.textContent === '样式')?.textContent ?? '',
  }))()`);
  console.log('BEFORE', JSON.stringify(before));
  const clicked = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('复制 CSS'));
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
  await sleep(300);
  const after = await evaluate(`(() => ({
    clicked: ${'true'},
    label: [...document.querySelectorAll('button')].find((b) => b.textContent.includes('复制') || b.textContent.includes('已复制'))?.textContent ?? '',
    styleText: [...document.querySelectorAll('.ins-section')].find((s) => s.querySelector('.ins-title')?.textContent === '样式')?.textContent ?? '',
  }))()`);
  console.log('AFTER', JSON.stringify({ clicked, ...after }));
  await evaluate(`(() => { const s = [...document.querySelectorAll('.ins-section')].find((x) => x.querySelector('.ins-title')?.textContent === '样式'); s?.scrollIntoView({ block: 'center' }); return true; })()`);
  await sleep(400);
  ws.close();
}
main().catch((error) => { console.error(error); process.exit(1); });
