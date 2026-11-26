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
  await send('Performance.enable');
  await sleep(1100);
  await evaluate(`(() => {
    window.__dragDurs = [];
    window.__dragCreates = [];
    const origRaf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => origRaf((ts) => {
      const t0 = performance.now();
      cb(ts);
      window.__dragDurs.push(performance.now() - t0);
    });
    const origCreate = document.createElement.bind(document);
    document.createElement = (tag, ...args) => {
      const el = origCreate(tag, ...args);
      if (String(tag).toLowerCase() === 'canvas') window.__dragCreates.push({ t: performance.now(), el });
      return el;
    };
    return true;
  })()`);

  const info = await evaluate(`(() => {
    const canvas = document.querySelector('canvas.canvas');
    const r = canvas?.getBoundingClientRect();
    return {
      zoom: document.querySelector('.zoom-value')?.textContent ?? '',
      canvas: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null,
    };
  })()`);
  if (!info.canvas) throw new Error('canvas 不存在');
  console.log('CANVAS', JSON.stringify(info));
  const readCursor = async () => {
    const text = await evaluate(`document.querySelector('.status-center')?.textContent ?? ''`);
    const match = text.match(/X\s*(-?\d+)\s*Y\s*(-?\d+)/);
    return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
  };
  const probe = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await sleep(45);
    return readCursor();
  };
  // 用状态栏世界坐标反算缩放与原点，稳定点中第一块画板中心（世界 200,150）。
  const px = Math.round(info.canvas.x + 120);
  const py = Math.round(info.canvas.y + 160);
  const w1 = await probe(px, py);
  const w2 = await probe(px + 300, py);
  if (!w1 || !w2) {
    const raw = await evaluate(`document.querySelector('.status-center')?.textContent ?? 'none'`);
    throw new Error(`状态栏没有世界坐标：${raw}`);
  }
  const scale = (w2.x - w1.x) / 300;
  if (scale <= 0) throw new Error('缩放反算失败');
  const x = Math.round(px + (200 - w1.x) / scale);
  const y = Math.round(py + (150 - w1.y) / scale);
  const hit = await probe(x, y);
  if (!hit || hit.x < 0 || hit.x > 400 || hit.y < 0 || hit.y > 300) {
    throw new Error(`没有点中第一块画板：${JSON.stringify(hit)}`);
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  for (let i = 1; i <= 8; i += 1) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + i * 2, y: y + i, button: 'left', buttons: 1 });
    await sleep(24);
  }
  const t0 = await evaluate('performance.now()');
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x + 16, y: y + 8, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(700);

  const result = await evaluate(`(() => {
    const durs = window.__dragDurs || [];
    const sorted = [...durs].sort((a, b) => a - b);
    const pick = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
    const creates = (window.__dragCreates || []).filter((item) => item.el.width > 0 || item.el.height > 0);
    const after = creates.filter((item) => item.t >= ${t0});
    return {
      zoom: document.querySelector('.zoom-value')?.textContent ?? '',
      rafP50: +pick(0.5).toFixed(2),
      rafP95: +pick(0.95).toFixed(2),
      rafMax: +(sorted.at(-1) ?? 0).toFixed(2),
      long16: durs.filter((v) => v > 16).length,
      createdAfterDrop: after.length,
      createdAfterDropSizes: after.slice(0, 3).map((item) => [item.el.width, item.el.height]),
      selected: document.querySelectorAll('.layer-row.selected').length,
      status: document.querySelector('.status-save')?.textContent ?? '',
    };
  })()`);
  console.log('DRAG', JSON.stringify(result));
  ws.close();
}
main().catch((error) => { console.error(error); process.exit(1); });
