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
  await sleep(350);
  const expanded = await evaluate(`(() => {
    if ([...document.querySelectorAll('.layer-row')].some((item) => item.textContent.includes('切片 1'))) return 'already';
    const frameRow = [...document.querySelectorAll('.layer-row')].find((item) => item.textContent.includes('桌面 1440'));
    const caret = frameRow?.querySelector('.layer-caret');
    if (!caret) return 'no-frame';
    caret.click();
    return 'expanded';
  })()`);
  console.log('EXPAND', expanded);
  await sleep(320);
  const selected = await evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((item) => item.textContent.includes('切片 1'));
    if (!row) return false;
    row.click();
    return true;
  })()`);
  if (!selected) throw new Error('图层树里没有切片 1');
  await sleep(400);
  const state = await evaluate(`(() => ({
    layers: [...document.querySelectorAll('.layer-row')].map((item) => item.innerText.trim()).slice(0, 14),
    inspector: document.querySelector('.right-panel .inspector-scroll')?.innerText.slice(0, 420),
    status: document.querySelector('.statusbar')?.innerText.slice(0, 140),
    topbar: document.querySelector('.topbar')?.innerText.slice(0, 140)
  }))()`);
  console.log('REOPEN', JSON.stringify(state));

  if (process.env.OPEN_EXPORT === '1') {
    const opened = await evaluate(`(() => {
      const button = [...document.querySelectorAll('.export-btn')].find((item) => item.textContent.includes('导出'));
      if (!button) return false;
      button.click();
      return true;
    })()`);
    if (!opened) throw new Error('没有导出按钮');
    await sleep(500);
    await evaluate(`(() => {
      const formatButton = [...document.querySelectorAll('.export-card .export-seg-btn')].find((item) => item.textContent.trim() === 'SVG');
      if (formatButton) formatButton.click();
      return true;
    })()`);
    await sleep(300);
    const dialog = await evaluate(`(() => ({
      subtitle: document.querySelector('.export-card .dialog-sub')?.innerText,
      summary: document.querySelector('.export-card .export-summary')?.innerText,
      body: document.querySelector('.export-card .export-body')?.innerText.slice(0, 320),
      button: document.querySelector('.export-card .export-actions .btn-primary')?.innerText
    }))()`);
    console.log('DIALOG', JSON.stringify(dialog));
    if (process.env.EXPORT_AFTER_DIALOG === '1') {
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
      console.log('EXPORTED', JSON.stringify(toast));
    }
  }

  ws.close();
}

main().catch((error) => { console.error('CDP ERROR', error.message); process.exit(1); });
