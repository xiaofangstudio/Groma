const port = process.env.CDP_PORT || '9239';
const waitMs = Number(process.env.PERF_WAIT || 2600);
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
  await sleep(700);
  await evaluate(`(() => {
    window.__fitDurs = [];
    window.__fitTs = [];
    window.__canvasCreates = [];
    const origRaf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => origRaf((ts) => {
      const t0 = performance.now();
      cb(ts);
      window.__fitDurs.push(performance.now() - t0);
      window.__fitTs.push(performance.now());
    });
    const origCreate = document.createElement.bind(document);
    document.createElement = (tag, ...args) => {
      const el = origCreate(tag, ...args);
      if (String(tag).toLowerCase() === 'canvas') window.__canvasCreates.push({ t: performance.now(), el });
      return el;
    };
    return true;
  })()`);

  const before = await send('Performance.getMetrics').then((res) => Object.fromEntries(res.metrics.map((m) => [m.name, m.value])));
  const fitStarted = await evaluate('performance.now()');
  await evaluate(`(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', code: 'Digit1', shiftKey: true, bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: '1', code: 'Digit1', shiftKey: true, bubbles: true }));
    return true;
  })()`);
  // 等总览缩略图逐帧补完；期间 rAF 包装记录所有 app 帧。
  await sleep(waitMs);
  const after = await send('Performance.getMetrics').then((res) => Object.fromEntries(res.metrics.map((m) => [m.name, m.value])));

  const result = await evaluate(`(() => {
    const durs = window.__fitDurs || [];
    const ts = window.__fitTs || [];
    const sorted = [...durs].sort((a, b) => a - b);
    const pick = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
    const start = ${fitStarted};
    const creates = (window.__canvasCreates || []).filter((item) => item.el.width > 0 || item.el.height > 0);
    const times = creates.map((item) => item.t);
    return {
      zoom: document.querySelector('.zoom-value')?.textContent ?? '',
      rows: document.querySelectorAll('.layer-row').length,
      rafCount: durs.length,
      rafP50: +pick(0.5).toFixed(2),
      rafP95: +pick(0.95).toFixed(2),
      rafMax: +(sorted.at(-1) ?? 0).toFixed(2),
      long16: durs.filter((v) => v > 16).length,
      long32: durs.filter((v) => v > 32).length,
      created: creates.length,
      createdIn100ms: times.filter((t) => t - start <= 100).length,
      createdIn500ms: times.filter((t) => t - start <= 500).length,
      canvasSizes: creates.slice(0, 3).map((item) => [item.el.width, item.el.height]),
      canvasHostChildren: document.querySelectorAll('.canvas-host *').length,
    };
  })()`);
  const delta = (name) => +(((after[name] ?? 0) - (before[name] ?? 0)) * 1000).toFixed(1);
  console.log('FIT', JSON.stringify({
    ...result,
    taskMs: delta('TaskDuration'),
    scriptMs: delta('ScriptDuration'),
    styleMs: delta('RecalcStyleDuration'),
    waitMs,
  }));
  ws.close();
}
main().catch((error) => { console.error(error); process.exit(1); });
