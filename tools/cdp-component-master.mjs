const port = process.env.CDP_PORT || '9241';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = targets.find((t) => t.type === 'page');
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
  await sleep(3000);

  await evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((el) => el.textContent.includes('按钮主组件') && !el.textContent.includes('实例'));
    row?.click();
    return Boolean(row);
  })()`);
  await sleep(700);
  await evaluate(`(() => { document.querySelector('.zoom-value')?.click(); return true; })()`);
  await sleep(600);

  const state = await evaluate(`(() => {
    const sec = [...document.querySelectorAll('.ins-section')].find((s) => s.querySelector('.ins-title')?.textContent === '组件');
    const panel = document.querySelector('.right-panel');
    if (panel) panel.scrollTop = 0;
    const scroll = document.querySelector('.inspector-scroll');
    if (scroll) scroll.scrollTop = 0;
    const overflow = [...document.querySelectorAll('.right-panel *')]
      .filter((el) => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1)
      .slice(0, 12)
      .map((el) => ({ tag: el.tagName, cls: String(el.className).slice(0, 60), cw: el.clientWidth, sw: el.scrollWidth }));
    return {
      type: document.querySelector('.type-chip')?.textContent ?? '',
      text: sec ? sec.innerText.replace(/\\n/g, ' | ') : '',
      instanceRows: [...document.querySelectorAll('.layer-row')].filter((el) => el.textContent.includes('实例')).length,
      syncAll: Boolean(sec && [...sec.querySelectorAll('button')].find((b) => b.textContent.includes('同步全部'))),
      zoom: document.querySelector('.zoom-value')?.textContent ?? '',
      overflow,
    };
  })()`);
  console.log('COMPONENT_MASTER', JSON.stringify(state));
  await sleep(500);
  ws.close();
}
main().catch((error) => { console.error(error); process.exit(1); });
