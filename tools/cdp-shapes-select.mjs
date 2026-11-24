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
  await sleep(300);
  const expanded = await evaluate(`(() => {
    const caret = document.querySelector('.layer-caret');
    if (caret) caret.click();
    return Boolean(caret);
  })()`);
  await sleep(500);
  const selected = await evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((item) => item.textContent.includes('星形 1'));
    if (!row) return false;
    row.click();
    return true;
  })()`);
  await sleep(700);
  const report = await evaluate(`(() => {
    const panel = document.querySelector('.right-panel')?.getBoundingClientRect();
    const bad = [];
    if (panel) {
      for (const el of document.querySelectorAll('.right-panel *')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right > panel.right + 0.5 || r.left < panel.left - 0.5 || r.bottom > panel.bottom + 0.5) {
          bad.push({ cls: el.className?.toString().slice(0, 40), x: r.x, y: r.y, right: r.right, bottom: r.bottom });
        }
      }
    }
    const tip = document.querySelector('.canvas-tip')?.getBoundingClientRect();
    return { panel: panel && { w: panel.width, h: panel.height }, bad: bad.slice(0, 15), tip: tip && { x: tip.x, w: tip.width, right: tip.right } };
  })()`);
  console.log('EXPANDED', expanded, 'SELECTED', selected);
  console.log(JSON.stringify(report));
  ws.close();
}

main().catch((error) => { console.error('CDP ERROR', error.message); process.exitCode = 1; });
