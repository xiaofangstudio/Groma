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
  await sleep(450);
  await evaluate(`(() => {
    const frame = [...document.querySelectorAll('.layer-row')].find((row) => row.innerText.includes('桌面 1440'));
    frame?.querySelector('.layer-caret')?.click();
    return true;
  })()`);
  await sleep(300);
  const selected = await evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((item) => item.textContent.includes('黄色卡片'));
    if (!row) return false;
    row.click();
    return true;
  })()`);
  if (!selected) throw new Error('图层树里没有黄色卡片');
  await sleep(500);
  console.log('FILL_SELECTED', await evaluate(`document.querySelector('.layer-row.is-selected')?.innerText.trim() ?? ''`));
  console.log('FILL_BLOCK', await evaluate(`Boolean(document.querySelector('.image-fill-block'))`));

  const opened = await evaluate(`(() => {
    const block = document.querySelector('.image-fill-block');
    const button = block ? [...block.querySelectorAll('.mini-action')].find((item) => item.textContent.includes('选择图片') || item.textContent.includes('换图')) : null;
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (!opened) throw new Error('没有图片填充入口');
  await sleep(500);
  const thumbCount = await evaluate(`document.querySelectorAll('.image-fill-thumb').length`);
  console.log('FILL_THUMBS', thumbCount);
  const applied = await evaluate(`(() => {
    const thumb = document.querySelector('.image-fill-thumb');
    if (!thumb) return false;
    thumb.click();
    return true;
  })()`);
  if (!applied) throw new Error('资产列表里没有可用的图片');
  await sleep(700);

  const focusChanged = await evaluate(`(() => {
    const field = [...document.querySelectorAll('.image-fill-block .field')].find((item) => item.querySelector('.field-label')?.textContent.trim() === '焦点X');
    const input = field?.querySelector('input');
    if (!input) return false;
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, '25');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    input.blur();
    return true;
  })()`);
  if (!focusChanged) throw new Error('没有找到焦点X输入框');
  await sleep(700);
  await evaluate(`(() => {
    document.querySelector('.image-fill-block')?.scrollIntoView({ block: 'center' });
    return true;
  })()`);
  await sleep(400);
  const state = await evaluate(`(() => ({
    selected: document.querySelector('.layer-row.is-selected')?.innerText.trim() ?? '',
    name: document.querySelector('.image-fill-current span:last-child')?.textContent ?? '',
    mode: [...document.querySelectorAll('.image-fill-block .fill-type-btn')].find((item) => item.className.includes('is-on'))?.textContent.trim() ?? '',
    fields: [...document.querySelectorAll('.image-fill-block .field')].map((item) => ({
      label: item.querySelector('.field-label')?.textContent.trim() ?? '',
      value: item.querySelector('input')?.value ?? '',
    })),
    save: document.querySelector('.status-save')?.textContent ?? '',
  }))()`);
  console.log('FILL_STATE', JSON.stringify(state));

  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 's', code: 'KeyS', modifiers: 2, windowsVirtualKeyCode: 83, nativeVirtualKeyCode: 83 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 's', code: 'KeyS', modifiers: 2, windowsVirtualKeyCode: 83, nativeVirtualKeyCode: 83 });
  await sleep(2500);
  console.log('FILL_SAVED', await evaluate(`document.querySelector('.status-save')?.textContent ?? ''`));
  await sleep(900);
  ws.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
