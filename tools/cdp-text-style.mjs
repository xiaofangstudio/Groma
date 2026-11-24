const port = process.env.CDP_PORT || '9222';
const name = process.env.LAYER_NAME || '标题';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
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
  await sleep(500);
  const picked = await evaluate(`(() => {
    let rows = [...document.querySelectorAll('.layer-row')];
    let target = rows.find((item) => item.innerText.trim() === ${JSON.stringify(name)})
      ?? rows.find((item) => item.innerText.includes(${JSON.stringify(name)}) && !item.innerText.includes('副标题'));
    if (!target) {
      rows.find((item) => item.innerText.includes('桌面 1440'))?.querySelector('.layer-caret')?.click();
      return 'expanded';
    }
    target.click();
    return target.innerText.trim();
  })()`);
  if (picked === 'expanded') {
    await sleep(400);
    const clicked = await evaluate(`(() => {
      const rows = [...document.querySelectorAll('.layer-row')];
      const target = rows.find((item) => item.innerText.trim() === ${JSON.stringify(name)})
        ?? rows.find((item) => item.innerText.includes(${JSON.stringify(name)}) && !item.innerText.includes('副标题'));
      if (!target) return 'no layer';
      target.click();
      return target.innerText.trim();
    })()`);
    if (clicked === 'no layer') throw new Error('展开后仍没有找到文本图层');
  } else if (picked === 'no layer') {
    throw new Error('没有找到文本图层');
  }
  await sleep(400);

  await evaluate(`(() => {
    const button = document.querySelector('.right-panel [aria-label="居中对齐"]');
    button?.click();
    return button ? 'align' : 'no align';
  })()`);
  await evaluate(`(() => {
    const field = [...document.querySelectorAll('.right-panel .field')].find(
      (item) => item.querySelector('.field-label')?.innerText === '行高'
    );
    if (!field) return 'no line';
    const input = field.querySelector('input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, '1.6');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.focus();
    input.blur();
    return 'line';
  })()`);
  await evaluate(`(() => {
    const button = document.querySelector('.right-panel .text-toggle');
    button?.click();
    return button ? 'italic' : 'no italic';
  })()`);
  await sleep(500);

  const state = await evaluate(`(() => ({
    inspector: document.querySelector('.right-panel .inspector-scroll')?.innerText.slice(0, 260),
    alignOn: document.querySelector('.right-panel [aria-label="居中对齐"]')?.getAttribute('aria-pressed'),
    italicOn: document.querySelector('.right-panel .text-toggle')?.getAttribute('aria-pressed'),
    lineHeight: [...document.querySelectorAll('.right-panel .field')].find(
      (item) => item.querySelector('.field-label')?.innerText === '行高'
    )?.querySelector('input')?.value
  }))()`);
  console.log('PICKED', picked);
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
