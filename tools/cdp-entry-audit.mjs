import fs from 'node:fs';
const port = process.env.CDP_PORT || '9241';
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
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    return res.result?.value;
  };
  const shoot = async (path) => {
    const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync(path, Buffer.from(shot.data, 'base64'));
    console.log('SHOT', path, fs.statSync(path).size);
  };
  const names = () => evaluate(`(() => [...document.querySelectorAll('.layer-row .layer-name')].map((el) => el.textContent.trim()))()`);

  await send('Runtime.enable');
  await sleep(1200);

  console.log('GUIDES', JSON.stringify(await evaluate(`(() => ({
    count: document.querySelector('.status-guide-count')?.textContent ?? '',
    lines: document.querySelectorAll('.manual-guide').length,
    buttons: [...document.querySelectorAll('.status-guide-btn')].map((el) => el.getAttribute('aria-label')),
  }))()`)));

  await evaluate(`document.querySelector('[aria-label="隐藏参考线"]')?.click()`);
  await sleep(250);
  console.log('GUIDES_HIDDEN', JSON.stringify(await evaluate(`({ lines: document.querySelectorAll('.manual-guide').length, label: document.querySelector('.status-guides .status-guide-btn')?.getAttribute('aria-label') })`)));
  await evaluate(`document.querySelector('[aria-label="显示参考线"]')?.click()`);
  await sleep(250);
  await evaluate(`document.querySelector('[aria-label="锁定参考线"]')?.click()`);
  await sleep(200);
  console.log('GUIDES_LOCKED', JSON.stringify(await evaluate(`({ locked: Boolean(document.querySelector('.status-guide-btn.is-on')), label: document.querySelector('.status-guide-btn.is-on')?.getAttribute('aria-label'), lines: document.querySelectorAll('.manual-guide').length })`)));
  await evaluate(`document.querySelector('[aria-label="解锁参考线"]')?.click()`);

  await evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((el) => el.querySelector('.layer-name')?.textContent.trim() === '天气图标');
    const caret = row?.querySelector('.layer-caret');
    if (caret && !row.classList.contains('is-open')) caret.click();
  })()`);
  await sleep(450);
  const before = await names();
  console.log('LAYERS', JSON.stringify(before));

  const targetName = before[before.length - 1];
  await evaluate(`(() => {
    const rows = [...document.querySelectorAll('.layer-row')];
    const row = rows.find((el) => el.querySelector('.layer-name')?.textContent.trim() === ${JSON.stringify(targetName)});
    if (!row) return;
    const r = row.getBoundingClientRect();
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 40, clientY: r.top + 12 }));
  })()`);
  await sleep(350);
  console.log('LAYER_MENU', JSON.stringify(await evaluate(`(() => ({
    open: Boolean(document.querySelector('.layer-menu')),
    items: [...document.querySelectorAll('.layer-menu button')].map((el) => el.innerText.replace(/\\s+/g, ' ').trim()),
  }))()`)));
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await sleep(250);

  await evaluate(`(() => {
    const rows = [...document.querySelectorAll('.layer-row')];
    const row = rows[rows.length - 1];
    row?.click();
  })()`);
  await sleep(300);
  console.log('ORDER_BAR', JSON.stringify(await evaluate(`(() => [...document.querySelectorAll('.layer-order-btn')].map((el) => ({ text: el.textContent.trim(), disabled: el.disabled })))()`)));
  const alignInfo = await evaluate(`(() => {
    const buttons = [...document.querySelectorAll('.align-grid-single .align-btn')];
    const input = document.querySelector('.field-grid input');
    return {
      buttons: buttons.map((el) => el.getAttribute('aria-label')),
      disabled: buttons.map((el) => el.disabled),
      x: input?.value ?? '',
    };
  })()`);
  await evaluate(`document.querySelector('.align-grid-single [aria-label="右对齐"]')?.click()`);
  await sleep(250);
  alignInfo.afterX = await evaluate(`document.querySelector('.field-grid input')?.value ?? ''`);
  console.log('ALIGN_ROW', JSON.stringify(alignInfo));
  await evaluate(`([...document.querySelectorAll('.layer-order-btn')].find((el) => el.textContent.trim() === '上移'))?.click()`);
  await sleep(350);
  console.log('AFTER_UP', JSON.stringify(await names()));

  const current = await names();
  const dragName = current[current.length - 1];
  await evaluate(`(() => {
    const rows = [...document.querySelectorAll('.layer-row')];
    const source = rows.find((el) => el.querySelector('.layer-name')?.textContent.trim() === ${JSON.stringify(dragName)});
    const target = rows.find((el) => el.querySelector('.layer-name')?.textContent.trim() === ${JSON.stringify(current[0])});
    if (!source || !target) return;
    const dt = new DataTransfer();
    source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
    const r = target.getBoundingClientRect();
    const over = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 60, clientY: r.top + 2 });
    target.dispatchEvent(over);
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 60, clientY: r.top + 2 }));
    source.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));
  })()`);
  await sleep(450);
  console.log('DRAG_RESULT', JSON.stringify({ dragged: dragName, before: current[0], after: await names() }));
  await shoot('shots/layer-entries.png');

  await evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((el) => el.querySelector('.layer-name')?.textContent.trim() === '天气图标');
    const r = row?.getBoundingClientRect();
    if (!row || !r) return;
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 40, clientY: r.top + 12 }));
  })()`);
  await sleep(300);
  await shoot('shots/layer-menu.png');

  console.log('FINAL_DOM', JSON.stringify(await evaluate(`(() => ({
    rows: document.querySelectorAll('.layer-row').length,
    orderBar: document.querySelectorAll('.layer-order-btn').length,
    layerMenu: document.querySelectorAll('.layer-menu button').length,
    guides: document.querySelectorAll('.manual-guide').length,
    guideControls: document.querySelectorAll('.status-guide-btn').length,
  }))()`)));
  ws.close();
}
main().catch((error) => { console.error('FAILED', error); process.exit(1); });
