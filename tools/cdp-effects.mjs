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
  await sleep(450);

  await evaluate(`(() => {
    const add = [...document.querySelectorAll('.effect-add-row .mini-action')].find((item) => item.textContent.includes('投影'));
    add?.click();
    return Boolean(add);
  })()`);
  await sleep(450);
  await evaluate(`(() => {
    const card = [...document.querySelectorAll('.effect-card')].find((item) => item.innerText.includes('投影'));
    if (!card) return false;
    const field = (label) => [...card.querySelectorAll('.field')].find((item) => item.querySelector('.field-label')?.textContent.trim() === label)?.querySelector('input');
    const set = (label, value) => {
      const input = field(label);
      if (!input) return false;
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      input.blur();
      return true;
    };
    set('Y', '12');
    set('模糊', '24');
    return true;
  })()`);
  await sleep(550);
  await evaluate(`(() => {
    const add = [...document.querySelectorAll('.effect-add-row .mini-action')].find((item) => item.textContent.includes('模糊'));
    add?.click();
    return Boolean(add);
  })()`);
  await sleep(450);
  await evaluate(`(() => {
    const card = [...document.querySelectorAll('.effect-card')].find((item) => item.innerText.includes('整层模糊'));
    if (!card) return false;
    const field = [...card.querySelectorAll('.field')].find((item) => item.querySelector('.field-label')?.textContent.trim() === '半径')?.querySelector('input');
    if (!field) return false;
    field.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(field, '3');
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    field.blur();
    return true;
  })()`);
  await sleep(700);
  await evaluate(`(() => {
    const section = [...document.querySelectorAll('.ins-section')].find((item) => item.querySelector('.ins-title')?.textContent.trim() === '效果');
    section?.scrollIntoView({ block: 'center' });
    return true;
  })()`);
  await sleep(450);
  const state = await evaluate(`(() => ({
    selected: document.querySelector('.inspector-name-input')?.value ?? '',
    cards: [...document.querySelectorAll('.effect-card')].map((card) => ({
      type: card.querySelector('.effect-type')?.textContent ?? '',
      values: [...card.querySelectorAll('.field')].map((item) => ({
        label: item.querySelector('.field-label')?.textContent.trim() ?? '',
        value: item.querySelector('input')?.value ?? '',
      })),
    })),
    save: document.querySelector('.status-save')?.textContent ?? '',
  }))()`);
  console.log('EFFECT_STATE', JSON.stringify(state));

  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 's', code: 'KeyS', modifiers: 2, windowsVirtualKeyCode: 83, nativeVirtualKeyCode: 83 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 's', code: 'KeyS', modifiers: 2, windowsVirtualKeyCode: 83, nativeVirtualKeyCode: 83 });
  await sleep(2500);
  console.log('EFFECT_SAVED', await evaluate(`document.querySelector('.status-save')?.textContent ?? ''`));
  await sleep(900);
  ws.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
