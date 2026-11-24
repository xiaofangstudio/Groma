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
  await sleep(400);
  const box = await evaluate(`(() => {
    const canvas = document.querySelector('.canvas-host canvas');
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  })()`);
  if (!box) throw new Error('没有画布');

  async function dragSlice(x1, y1, x2, y2) {
    const clicked = await evaluate(`(() => {
      const button = document.querySelector('[aria-label="切片工具"]');
      if (!button) return false;
      button.click();
      return true;
    })()`);
    if (!clicked) throw new Error('没有切片工具按钮');
    await sleep(260);
    const sx = Math.round(box.left + box.width * x1);
    const sy = Math.round(box.top + box.height * y1);
    const ex = Math.round(box.left + box.width * x2);
    const ey = Math.round(box.top + box.height * y2);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sx, y: sy });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: sx, y: sy, button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 12; i += 1) {
      await send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: Math.round(sx + ((ex - sx) * i) / 12),
        y: Math.round(sy + ((ey - sy) * i) / 12),
        button: 'left',
        buttons: 1,
      });
      await sleep(28);
    }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: ex, y: ey, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(650);
  }

  await dragSlice(0.39, 0.40, 0.68, 0.66);

  const created = await evaluate(`(() => ({
    layers: [...document.querySelectorAll('.layer-row')].map((item) => item.innerText.trim()).slice(0, 14),
    inspector: document.querySelector('.right-panel .inspector-scroll')?.innerText.slice(0, 420),
    active: document.querySelector('[aria-label="切片工具"]')?.className,
    status: document.querySelector('.statusbar')?.innerText.slice(0, 120)
  }))()`);
  console.log('CREATED', JSON.stringify(created));

  async function openExport() {
    const opened = await evaluate(`(() => {
      const button = [...document.querySelectorAll('.export-btn')].find((item) => item.textContent.includes('导出'));
      if (!button) return false;
      button.click();
      return true;
    })()`);
    if (!opened) throw new Error('没有导出按钮');
    await sleep(550);
  }

  async function exportOnce(format, scaleLabel) {
    await openExport();
    const dialog = await evaluate(`(() => ({
      subtitle: document.querySelector('.export-card .dialog-sub')?.innerText,
      summary: document.querySelector('.export-card .export-summary')?.innerText,
      body: document.querySelector('.export-card .export-body')?.innerText.slice(0, 320)
    }))()`);
    console.log('DIALOG', format, JSON.stringify(dialog));
    const chosen = await evaluate(`(() => {
      const formatButton = [...document.querySelectorAll('.export-card .export-seg-btn')].find((item) => item.textContent.trim() === '${format}');
      if (formatButton) formatButton.click();
      const scaleButton = [...document.querySelectorAll('.export-card [aria-label="导出倍数"] .export-seg-btn')].find((item) => item.textContent.trim() === '${scaleLabel}');
      if (scaleButton) scaleButton.click();
      return true;
    })()`);
    if (!chosen) throw new Error('无法选择导出格式');
    await sleep(320);
    const before = await evaluate(`JSON.stringify({
      subtitle: document.querySelector('.export-card .dialog-sub')?.innerText,
      summary: document.querySelector('.export-card .export-summary')?.innerText,
      size: document.querySelector('.export-card .export-output-size')?.innerText
    })`);
    console.log('BEFORE', format, before);
    await evaluate(`(() => {
      const button = document.querySelector('.export-card .export-actions .btn-primary');
      if (!button) return false;
      button.click();
      return true;
    })()`);
    await sleep(1600);
    const toast = await evaluate(`(() => ({
      title: document.querySelector('.toast strong')?.innerText,
      path: document.querySelector('.toast-path')?.getAttribute('title') ?? document.querySelector('.toast-path')?.innerText,
      dialogOpen: Boolean(document.querySelector('.export-card'))
    }))()`);
    console.log('EXPORTED', format, JSON.stringify(toast));
  }

  await exportOnce('PNG', '1×');
  await exportOnce('SVG', '1×');

  const selected = await evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((item) => item.textContent.includes('切片 1'));
    if (!row) return false;
    row.click();
    return true;
  })()`);
  if (!selected) throw new Error('无法重新选中切片');
  await sleep(450);
  const final = await evaluate(`(() => ({
    layers: [...document.querySelectorAll('.layer-row')].map((item) => item.innerText.trim()).slice(0, 14),
    inspector: document.querySelector('.right-panel .inspector-scroll')?.innerText.slice(0, 420),
    topbar: document.querySelector('.topbar')?.innerText.slice(0, 140)
  }))()`);
  console.log('FINAL', JSON.stringify(final));

  await evaluate(`(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
    return 'save';
  })()`);
  await sleep(1500);
  console.log('SAVED');
  ws.close();
}

main().catch((error) => { console.error('CDP ERROR', error.message); process.exit(1); });
