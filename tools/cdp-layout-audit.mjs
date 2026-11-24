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
  await sleep(250);
  const report = await evaluate(`(() => {
    const pick = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { sel, x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom, clientW: el.clientWidth, scrollW: el.scrollWidth, clientH: el.clientHeight, scrollH: el.scrollHeight, bg: cs.backgroundColor, overflowX: cs.overflowX, overflowY: cs.overflowY };
    };
    const sels = ['.app', '.shell', '.main', '.left-panel', '.panel-head', '.page-list', '.layer-head', '.layer-scroll', '.panel-foot', '.canvas-host', '.right-panel', '.statusbar'];
    const boxes = sels.map(pick).filter(Boolean);
    const panel = document.querySelector('.left-panel')?.getBoundingClientRect();
    const bad = [];
    if (panel) {
      for (const el of document.querySelectorAll('.left-panel *')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right > panel.right + 0.5 || r.left < panel.left - 0.5 || r.bottom > panel.bottom + 0.5) {
          bad.push({ cls: el.className?.toString().slice(0, 40), x: r.x, y: r.y, right: r.right, bottom: r.bottom });
        }
      }
    }
    return { viewport: { w: innerWidth, h: innerHeight }, boxes, bad: bad.slice(0, 20) };
  })()`);
  console.log(JSON.stringify(report, null, 2));
  ws.close();
}

main().catch((error) => { console.error('CDP ERROR', error.message); process.exitCode = 1; });
