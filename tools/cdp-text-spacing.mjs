const port = process.env.CDP_PORT || '9238';
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

  await send('Runtime.enable');
  await sleep(400);
  const selected = await evaluate(`(() => {
    const frame = [...document.querySelectorAll('.layer-row')].find((row) => row.innerText.includes('桌面 1440'));
    frame?.querySelector('.layer-caret')?.click();
    return true;
  })()`);
  await sleep(300);
  await evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((item) => item.textContent.includes('标题'));
    row?.click();
    return Boolean(row);
  })()`);
  await sleep(500);

  const read = () => evaluate(`(() => {
    const fields = [...document.querySelectorAll('.field')].map((field) => ({
      label: field.querySelector('.field-label')?.textContent.trim() ?? '',
      value: field.querySelector('input')?.value ?? '',
    })).filter((field) => ['字号', '字重', '字距'].includes(field.label));
    return {
      fields,
      selected: document.querySelector('.layer-row.is-selected')?.innerText.trim() ?? '',
      spacing: document.querySelector('.field.is-triple')?.innerText ?? '',
    };
  })()`);
  console.log('SPACING_BEFORE', JSON.stringify(await read()));

  const changed = await evaluate(`(() => {
    const field = [...document.querySelectorAll('.field')].find((item) => item.querySelector('.field-label')?.textContent.trim() === '字距');
    const input = field?.querySelector('input');
    if (!input) return false;
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, '6');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    input.blur();
    return true;
  })()`);
  if (!changed) throw new Error('没有字距输入框');
  await sleep(1500);
  console.log('SPACING_AFTER', JSON.stringify(await read()));
  console.log('SPACING_STATUS', await evaluate(`document.querySelector('.status-save')?.textContent ?? ''`));

  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 's', code: 'KeyS', modifiers: 2, windowsVirtualKeyCode: 83, nativeVirtualKeyCode: 83 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 's', code: 'KeyS', modifiers: 2, windowsVirtualKeyCode: 83, nativeVirtualKeyCode: 83 });
  await sleep(3000);
  console.log('SPACING_SAVED', await evaluate(`document.querySelector('.status-save')?.textContent ?? ''`));
  await sleep(800);
  ws.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
