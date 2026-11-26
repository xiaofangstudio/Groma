const port = process.env.CDP_PORT || '9238';
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
  const metrics = async () => {
    const res = await send('Performance.getMetrics');
    return Object.fromEntries(res.metrics.map((m) => [m.name, m.value]));
  };

  await send('Runtime.enable');
  await send('Performance.enable');
  await sleep(700);
  if (process.env.PERF_FIT === '1') {
    await evaluate(`(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', code: 'Digit1', shiftKey: true, bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: '1', code: 'Digit1', shiftKey: true, bubbles: true }));
      return true;
    })()`);
    await sleep(900);
  }
  await evaluate(`(() => {
    window.__rafDurs = [];
    const orig = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => orig((ts) => {
      const t0 = performance.now();
      cb(ts);
      window.__rafDurs.push(performance.now() - t0);
    });
    return true;
  })()`);

  const info = await evaluate(`(() => {
    const canvas = document.querySelector('canvas.canvas');
    const r = canvas?.getBoundingClientRect();
    return {
      zoom: document.querySelector('.zoom-value')?.textContent ?? '',
      rows: document.querySelectorAll('.layer-row').length,
      frames: document.querySelectorAll('.page-row').length,
      canvas: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null,
      status: document.querySelector('.status-save')?.textContent ?? '',
    };
  })()`);
  console.log('INFO', JSON.stringify(info));

  if (!info.canvas) throw new Error('canvas 不存在');
  const cx = Math.round(info.canvas.x + info.canvas.w / 2);
  const cy = Math.round(info.canvas.y + info.canvas.h / 2);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx, y: cy });

  const before = await metrics();
  await send('Profiler.enable');
  await send('Profiler.setSamplingInterval', { interval: 200 });
  await send('Profiler.start');
  const start = Date.now();
  const steps = Number(process.env.PERF_STEPS || 60);
  if (process.env.PERF_MODE === 'pan') {
    await evaluate(`(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
      return true;
    })()`);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx, y: cy });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 0; i < steps; i += 1) {
      await send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: cx + i * 3,
        y: cy + i * 2,
        button: 'left',
        buttons: 1,
      });
      await sleep(16);
    }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx + steps * 3, y: cy + steps * 2, button: 'left', buttons: 0, clickCount: 1 });
  } else {
    for (let i = 0; i < steps; i += 1) {
      await send('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x: cx,
        y: cy,
        deltaX: 0,
        deltaY: i % 2 === 0 ? -80 : 80,
        modifiers: 0,
      });
      await sleep(32);
    }
  }
  await sleep(220);
  const profile = await send('Profiler.stop');
  const after = await metrics();
  const elapsed = Date.now() - start;

  const delta = (name) => (after[name] ?? 0) - (before[name] ?? 0);
  console.log('METRICS', JSON.stringify({
    steps,
    elapsedMs: elapsed,
    perStepMs: +(elapsed / steps).toFixed(2),
    taskMs: +(delta('TaskDuration') * 1000).toFixed(1),
    scriptMs: +(delta('ScriptDuration') * 1000).toFixed(1),
    layoutMs: +(delta('LayoutDuration') * 1000).toFixed(1),
    styleMs: +(delta('RecalcStyleDuration') * 1000).toFixed(1),
    jsHeapMB: +((after.JSHeapUsedSize ?? 0) / 1048576).toFixed(1),
  }));

  const nodes = profile.profile.nodes;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const hot = new Map();
  for (const node of nodes) {
    if (!node.hitCount) continue;
    const call = node.callFrame;
    const key = `${call.functionName || '(anonymous)'} @ ${call.url || '?'}:${call.lineNumber + 1}`;
    hot.set(key, (hot.get(key) ?? 0) + node.hitCount);
  }
  console.log('HOT', JSON.stringify([...hot.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16), null, 2));

  const raf = await evaluate(`(() => {
    const list = window.__rafDurs || [];
    const sorted = [...list].sort((a, b) => a - b);
    const pick = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
    return { count: list.length, p50: +pick(0.5).toFixed(2), p95: +pick(0.95).toFixed(2), max: +(sorted.at(-1) ?? 0).toFixed(2) };
  })()`);
  console.log('RAF', JSON.stringify(raf));

  const finalInfo = await evaluate(`(() => ({
    zoom: document.querySelector('.zoom-value')?.textContent ?? '',
    rows: document.querySelectorAll('.layer-row').length,
    canvasChildren: document.querySelectorAll('.canvas-host *').length,
  }))()`);
  console.log('FINAL', JSON.stringify(finalInfo));
  ws.close();
}
main().catch((error) => { console.error(error); process.exit(1); });
