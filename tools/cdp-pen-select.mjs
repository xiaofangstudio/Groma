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
    if ([...document.querySelectorAll('.layer-row')].some((item) => item.textContent.includes('钢笔'))) return 'already';
    const frameRow = [...document.querySelectorAll('.layer-row')].find((item) => item.textContent.includes('桌面 1440'));
    const caret = frameRow?.querySelector('.layer-caret');
    if (!caret) return 'no-frame';
    caret.click();
    return 'expanded';
  })()`);
  console.log('EXPAND', expanded);
  await sleep(320);
  const selected = await evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((item) => item.textContent.includes('钢笔'));
    if (!row) return false;
    row.click();
    return true;
  })()`);
  if (!selected) throw new Error('图层树里没有钢笔路径');
  await sleep(300);
  await evaluate(`document.querySelector('[aria-label="钢笔工具"]')?.click()`);
  await sleep(450);
  const state = await evaluate(`(() => {
    const rect = (el) => el ? Math.round(el.getBoundingClientRect().right) : 0;
    return {
      layers: [...document.querySelectorAll('.layer-row')].map((item) => item.innerText.trim()).slice(0, 14),
      inspector: document.querySelector('.right-panel .inspector-scroll')?.innerText.slice(0, 460),
      status: document.querySelector('.statusbar')?.innerText.slice(0, 140),
      anchors: document.querySelectorAll('.pen-overlay .pen-anchor').length,
      topbar: {
        leftRight: rect(document.querySelector('.topbar-left')),
        toolsLeft: Math.round(document.querySelector('.topbar-tools')?.getBoundingClientRect().left ?? 0),
        name: document.querySelector('.doc-name')?.value
      }
    };
  })()`);
  console.log('REOPEN', JSON.stringify(state));
  ws.close();
}

main().catch((error) => { console.error('CDP ERROR', error.message); process.exit(1); });
