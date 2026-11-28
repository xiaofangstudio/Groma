const port = process.env.CDP_PORT || '9241';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('没有页面目标');
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
  await sleep(2500);

  const expand = async (text) => evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((el) => el.textContent.includes('${text}'));
    row?.querySelector('.layer-caret')?.click();
    return Boolean(row);
  })()`);
  const selectRow = async (text) => evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((el) => el.textContent.includes('${text}'));
    row?.click();
    return Boolean(row);
  })()`);
  const read = async () => evaluate(`(() => {
    const get = (label) => {
      const inp = [...document.querySelectorAll('.right-panel input')].find((i) => i.type === 'text' && i.closest('label')?.innerText.trim() === label);
      return inp?.value ?? null;
    };
    const sec = [...document.querySelectorAll('.ins-section')].find((s) => s.querySelector('.ins-title')?.textContent === '布局尺寸');
    return { x: get('X'), y: get('Y'), w: get('W'), h: get('H'), child: sec ? sec.innerText.replace(/\\n/g, ' | ') : null };
  })()`);
  const clickLabel = async (scopeTitle, labelText) => evaluate(`(() => {
    const sec = [...document.querySelectorAll('.ins-section')].find((s) => s.querySelector('.ins-title')?.textContent === '${scopeTitle}');
    if (!sec) return { ok: false };
    sec.scrollIntoView({ block: 'center' });
    const label = [...sec.querySelectorAll('label')].find((l) => l.innerText.includes('${labelText}'));
    const input = label?.querySelector('input');
    input?.click();
    return { ok: Boolean(input), checked: input?.checked ?? null };
  })()`);
  const setField = async (label, value) => evaluate(`(() => {
    const inp = [...document.querySelectorAll('.right-panel input')].find((i) => i.type === 'text' && i.closest('label')?.innerText.trim() === '${label}');
    if (!inp) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    inp.focus();
    setter.call(inp, '${value}');
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    inp.blur();
    return true;
  })()`);

  await expand('自动布局验收画板');
  await sleep(350);
  await expand('按钮组');
  await sleep(350);

  await selectRow('按钮 1');
  await sleep(700);
  console.log('CHILD_START', JSON.stringify(await read()));
  console.log('MAIN_FILL_ON', JSON.stringify(await clickLabel('布局尺寸', '横向填满剩余')));
  await sleep(900);
  console.log('AFTER_MAIN_FILL', JSON.stringify(await read()));
  console.log('MAIN_FILL_OFF', JSON.stringify(await clickLabel('布局尺寸', '横向填满剩余')));
  await sleep(900);
  console.log('AFTER_MAIN_OFF', JSON.stringify(await read()));

  await selectRow('按钮组');
  await sleep(700);
  console.log('CONTAINER_START', JSON.stringify(await read()));
  console.log('SET_W', await setField('W', '760'));
  await sleep(150);
  console.log('SET_H', await setField('H', '160'));
  await sleep(900);
  console.log('AFTER_SIZE', JSON.stringify(await read()));

  console.log('HUG_ON', JSON.stringify(await clickLabel('自动布局', '适应宽度')));
  await sleep(900);
  console.log('AFTER_HUG', JSON.stringify(await read()));
  console.log('HUG_OFF', JSON.stringify(await clickLabel('自动布局', '适应宽度')));
  await sleep(900);
  console.log('SET_W_BACK', await setField('W', '760'));
  await sleep(900);
  console.log('AFTER_HUG_OFF', JSON.stringify(await read()));

  await selectRow('按钮 1');
  await sleep(700);
  console.log('CROSS_FILL_ON', JSON.stringify(await clickLabel('布局尺寸', '纵向填满')));
  await sleep(900);
  console.log('AFTER_CROSS_FILL', JSON.stringify(await read()));
  console.log('MAIN_FILL_ON_AGAIN', JSON.stringify(await clickLabel('布局尺寸', '横向填满剩余')));
  await sleep(1000);
  console.log('FINAL', JSON.stringify(await read()));

  const panel = await evaluate(`(() => {
    const overflow = [...document.querySelectorAll('.right-panel *')]
      .filter((el) => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1)
      .slice(0, 10)
      .map((el) => ({ cls: String(el.className).slice(0, 40), text: (el.textContent || '').trim().slice(0, 24), cw: el.clientWidth, sw: el.scrollWidth }));
    return { overflow };
  })()`);
  console.log('PANEL', JSON.stringify(panel));
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', code: 'Digit1', shiftKey: true, bubbles: true }))`);
  await sleep(500);
  ws.close();
}
main().catch((error) => { console.error(error); process.exit(1); });
