const port = process.env.CDP_PORT || '9222';
const name = process.env.LAYER_NAME || 'image-layer-source';
const path = process.env.REPLACE_PATH;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  if (!path) throw new Error('缺少 REPLACE_PATH');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = targets.find((t) => t.type === 'page' && /tauri|127\.0\.0\.1|localhost/.test(t.url)) ?? targets.find((t) => t.type === 'page');
  if (!page) throw new Error('没有找到 Groma 页面');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let seq = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (!msg.id) return;
    const slot = pending.get(msg.id);
    if (!slot) return;
    pending.delete(msg.id);
    if (msg.error) slot.reject(new Error(msg.error.message));
    else slot.resolve(msg.result);
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
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
  await send('DOM.enable');
  await sleep(500);
  await evaluate(`(() => {
    const rows = [...document.querySelectorAll('.layer-row')];
    if (!rows.some((item) => item.innerText.includes(${JSON.stringify(name)}))) {
      rows.find((item) => item.innerText.includes('桌面 1440'))?.querySelector('.layer-caret')?.click();
    }
    return 'ok';
  })()`);
  await sleep(400);
  const picked = await evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((item) => item.innerText.includes(${JSON.stringify(name)}));
    if (!row) return 'no layer';
    row.click();
    return row.innerText.trim();
  })()`);
  if (picked === 'no layer') throw new Error('没有找到图片图层');
  await sleep(500);

  const documentInfo = await send('DOM.getDocument', { depth: 1 });
  const input = await send('DOM.querySelector', {
    nodeId: documentInfo.root.nodeId,
    selector: '.right-panel input[type=file]',
  });
  if (!input.nodeId) throw new Error('图片检查器里没有替换输入框');
  await send('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [path] });
  console.log('FILE SET', path);

  let state = null;
  for (let i = 0; i < 20; i += 1) {
    await sleep(400);
    state = await evaluate(`(() => ({
      inspector: document.querySelector('.right-panel .inspector-scroll')?.innerText.slice(0, 320),
      buttons: [...document.querySelectorAll('.right-panel .wide-action')].map((x) => x.innerText.trim()),
      layers: [...document.querySelectorAll('.layer-row')].map((x) => x.innerText.trim())
    }))()`);
    if (state.inspector?.includes('替换') && !state.buttons.includes('替换中…')) break;
  }
  console.log('STATE', JSON.stringify(state));

  await evaluate(`(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
    return 'save';
  })()`);
  await sleep(1200);
  console.log('SAVED');
  ws.close();
}

main().catch((error) => {
  console.error('CDP ERROR', error.message);
  process.exitCode = 1;
});
