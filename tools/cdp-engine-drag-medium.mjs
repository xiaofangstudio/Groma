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
  const click = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(120);
  };

  await send('Runtime.enable');
  await sleep(4500);
  await evaluate(`(() => {
    window.__engineDurs = [];
    window.__engineCreates = [];
    const origRaf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => origRaf((ts) => {
      const t0 = performance.now();
      cb(ts);
      window.__engineDurs.push(performance.now() - t0);
    });
    const origCreate = document.createElement.bind(document);
    document.createElement = (tag, ...args) => {
      const el = origCreate(tag, ...args);
      if (String(tag).toLowerCase() === 'canvas') window.__engineCreates.push({ t: performance.now(), el });
      return el;
    };
    return true;
  })()`);
  await sleep(700);

  const readInfo = async () => evaluate(`(() => {
    const canvas = document.querySelector('canvas.canvas');
    const r = canvas?.getBoundingClientRect();
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('groma:project-ui:v1:'));
    const ui = keys.map((k) => [k, localStorage.getItem(k)]);
    const zv = document.querySelector('.zoom-value')?.getBoundingClientRect();
    const minus = document.querySelector('.zoom-btn')?.getBoundingClientRect();
    return {
      zoom: document.querySelector('.zoom-value')?.textContent ?? '',
      canvas: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null,
      ui,
      zoomValue: zv ? { x: Math.round(zv.x + zv.width / 2), y: Math.round(zv.y + zv.height / 2) } : null,
      minus: minus ? { x: Math.round(minus.x + minus.width / 2), y: Math.round(minus.y + minus.height / 2) } : null,
    };
  })()`);

  let info = await readInfo();
  if (!info.canvas) throw new Error('canvas 不存在');
  console.log('START', JSON.stringify({ zoom: info.zoom, canvas: info.canvas }));

  // 固定到 33%：点 zoom-value 回 100%，再点 5 次减号（100×0.8^5≈32.8%）。
  const pct = parseInt(info.zoom, 10);
  if (!(pct >= 32 && pct <= 34)) {
    if (!info.zoomValue || !info.minus) throw new Error('缩放按钮不存在');
    await click(info.zoomValue.x, info.zoomValue.y);
    await sleep(500);
    for (let i = 0; i < 5; i += 1) await click(info.minus.x, info.minus.y);
    await sleep(1200);
    info = await readInfo();
    console.log('ZOOM-SET', JSON.stringify({ zoom: info.zoom }));
  }

  const storage = info.ui.find(([k]) => k.includes('Perf-600'));
  if (!storage) throw new Error('没有 Perf-600 的 viewport 记录');
  const parsed = JSON.parse(storage[1]);
  const pageId = parsed.pageId || Object.keys(parsed.viewports)[0];
  const v = parsed.viewports[pageId];
  console.log('VIEW', JSON.stringify(v));
  if (!(v.scale >= 0.32 && v.scale <= 0.34)) throw new Error(`工程不在 33%：${v.scale}`);

  const canvas = info.canvas;
  const RULER = 20;
  let target = null;
  for (let i = 0; i < 600; i += 1) {
    const x = (i % 26) * 520 + 200;
    const y = Math.floor(i / 26) * 420 + 150;
    const sx = canvas.x + RULER + v.x + x * v.scale;
    const sy = canvas.y + RULER + v.y + y * v.scale;
    if (sx > canvas.x + 60 && sx < canvas.x + canvas.w - 60 && sy > canvas.y + 60 && sy < canvas.y + canvas.h - 60) {
      target = { i: i + 1, x: Math.round(sx), y: Math.round(sy), worldX: x, worldY: y };
      break;
    }
  }
  if (!target) throw new Error('视口内没有可点的画板');
  console.log('TARGET', JSON.stringify(target));

  await evaluate('window.__engineDurs = []; window.__engineCreates = []; true');
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: target.x, y: target.y });
  await sleep(120);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: target.x, y: target.y, button: 'left', buttons: 1, clickCount: 1 });
  for (let i = 1; i <= 8; i += 1) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: target.x + i * 2, y: target.y + i, button: 'left', buttons: 1 });
    await sleep(24);
  }
  const t0 = await evaluate('performance.now()');
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: target.x + 16, y: target.y + 8, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(800);

  const result = await evaluate(`(() => {
    const durs = window.__engineDurs || [];
    const sorted = [...durs].sort((a, b) => a - b);
    const pick = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
    const creates = (window.__engineCreates || []).filter((item) => item.el.width > 0 || item.el.height > 0);
    const after = creates.filter((item) => item.t >= ${t0});
    return {
      zoom: document.querySelector('.zoom-value')?.textContent ?? '',
      rafCount: durs.length,
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
