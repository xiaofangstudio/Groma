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
    const row = [...document.querySelectorAll('.layer-row')].find((item) => item.textContent.includes('标题'));
    if (!row) return false;
    row.click();
    return true;
  })()`);
  if (!selected) throw new Error('图层树里没有标题');
  await sleep(450);

  const textChanged = await evaluate(`(() => {
    const area = document.querySelector('#text-editor');
    if (!area) return false;
    area.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(area, '设计稿交付\\n组件状态补齐\\n导出一致性检查');
    area.dispatchEvent(new Event('input', { bubbles: true }));
    area.blur();
    return true;
  })()`);
  if (!textChanged) throw new Error('没有文本编辑框');
  await sleep(500);

  const bullet = await evaluate(`(() => {
    const button = [...document.querySelectorAll('.text-toggle')].find((item) => item.textContent.includes('• 列表'));
    if (!button) return false;
    if (!button.className.includes('is-on')) button.click();
    return true;
  })()`);
  if (!bullet) throw new Error('没有项目符号按钮');
  await sleep(450);

  const spacing = await evaluate(`(() => {
    const field = [...document.querySelectorAll('.field')].find((item) => item.querySelector('.field-label')?.textContent.trim() === '段距');
    const input = field?.querySelector('input');
    if (!input) return false;
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, '14');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    input.blur();
    return true;
  })()`);
  if (!spacing) throw new Error('没有段距输入框');
  await sleep(700);
  await evaluate(`(() => {
    document.querySelector('.ins-section .text-align-row')?.scrollIntoView({ block: 'center' });
    return true;
  })()`);
  await sleep(400);
  const state = await evaluate(`(() => ({
    text: document.querySelector('#text-editor')?.value ?? '',
    list: [...document.querySelectorAll('.text-toggle')].filter((item) => item.className.includes('is-on')).map((item) => item.textContent.trim()),
    fields: [...document.querySelectorAll('.field')].map((item) => ({
      label: item.querySelector('.field-label')?.textContent.trim() ?? '',
      value: item.querySelector('input')?.value ?? '',
    })).filter((item) => ['段距', '行高'].includes(item.label)),
    save: document.querySelector('.status-save')?.textContent ?? '',
  }))()`);
  console.log('LIST_STATE', JSON.stringify(state));

  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 's', code: 'KeyS', modifiers: 2, windowsVirtualKeyCode: 83, nativeVirtualKeyCode: 83 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 's', code: 'KeyS', modifiers: 2, windowsVirtualKeyCode: 83, nativeVirtualKeyCode: 83 });
  await sleep(2500);
  console.log('LIST_SAVED', await evaluate(`document.querySelector('.status-save')?.textContent ?? ''`));
  await sleep(900);
  ws.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
