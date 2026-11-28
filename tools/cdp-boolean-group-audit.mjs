import fs from 'node:fs';

const port = process.env.CDP_PORT || '9250';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = targets.find((t) => t.type === 'page' && /tauri|127\.0\.0\.1|localhost/.test(t.url)) ?? targets.find((t) => t.type === 'page');
  if (!page) throw new Error('没有 Groma 页面');
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
    msg.error ? slot.reject(new Error(msg.error.message)) : slot.resolve(msg.result);
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
  const shot = async (path) => {
    const result = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync(path, Buffer.from(result.data, 'base64'));
  };
  const state = () => evaluate(`(() => {
    const selectedRow = document.querySelector('.layer-row.is-selected');
    return {
      selected: [...document.querySelectorAll('.layer-row.is-selected .layer-name')].map((el) => el.textContent.trim()),
      selectedRows: document.querySelectorAll('.layer-row.is-selected').length,
      selectedType: document.querySelector('.inspector-sel .type-chip')?.textContent.trim() ?? null,
      selectedCaret: Boolean(selectedRow?.querySelector('.layer-caret:not(.is-empty)')),
      layerNames: [...document.querySelectorAll('.layer-row .layer-name')].map((el) => el.textContent.trim()).slice(0, 18),
      bar: document.querySelector('.boolean-bar')?.textContent.trim() ?? null,
      barLabel: document.querySelector('.boolean-bar-label')?.textContent.trim() ?? null,
      barActive: document.querySelector('.boolean-bar-item.is-active')?.textContent.trim() ?? null,
      rightActive: document.querySelector('.boolean-op-btn.is-active')?.textContent.trim() ?? null,
      rightGrid: [...document.querySelectorAll('.boolean-op-btn')].map((el) => el.textContent.trim()),
      topLabel: [...document.querySelectorAll('.bool-btn')].map((el) => el.textContent.trim()),
      toast: document.querySelector('.toast strong')?.textContent.trim() ?? null,
      w: [...document.querySelectorAll('.field')].find((el) => el.querySelector('.field-label')?.textContent.trim() === 'W')?.querySelector('.field-input')?.value ?? null,
    };
  })()`);

  await send('Runtime.enable');
  await send('Page.enable');
  await sleep(900);
  await evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((el) => el.querySelector('.layer-name')?.textContent.trim() === '布尔演示');
    row?.querySelector('.layer-caret')?.click();
  })()`);
  await sleep(350);
  await evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((el) => el.querySelector('.layer-name')?.textContent.trim() === '红块');
    row?.click();
  })()`);
  await sleep(180);
  await evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((el) => el.querySelector('.layer-name')?.textContent.trim() === '蓝块');
    row?.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
  })()`);
  await sleep(450);
  const before = await state();
  if (before.selectedRows !== 2) throw new Error(`多选失败：${JSON.stringify(before.selected)}`);
  if (!before.bar) throw new Error('布尔快捷条没有出现');

  await evaluate(`(() => {
    const btn = [...document.querySelectorAll('.boolean-bar-item')].find((el) => el.textContent.trim() === '差集');
    btn?.click();
  })()`);
  await sleep(650);
  const created = await state();
  if (created.selectedRows !== 1) throw new Error(`布尔组没有收成单层：${JSON.stringify(created.selected)}`);
  if (created.selected[0] !== '差集 1') throw new Error(`布尔组命名不对：${created.selected[0]}`);
  if (created.selectedType !== '布尔组') throw new Error(`右栏类型不是布尔组：${created.selectedType}`);
  if (!created.selectedCaret) throw new Error('布尔组图层没有展开箭头');
  if (created.barLabel !== '布尔类型' || created.barActive !== '差集') throw new Error(`切换条不对：${created.barLabel}/${created.barActive}`);
  if (created.rightActive !== '差集') throw new Error(`右栏布尔类型未激活差集：${created.rightActive}`);

  await evaluate(`(() => {
    const row = document.querySelector('.layer-row.is-selected');
    row?.querySelector('.layer-caret')?.click();
  })()`);
  await sleep(350);
  const expanded = await state();
  if (!expanded.layerNames.includes('红块') || !expanded.layerNames.includes('蓝块')) throw new Error(`布尔组子层未展开：${expanded.layerNames.join('/')}`);
  await shot('shots/boolean-group.png');

  await evaluate(`(() => {
    const label = [...document.querySelectorAll('.field')].find((el) => el.querySelector('.field-label')?.textContent.trim() === 'W');
    const input = label?.querySelector('.field-input');
    if (!input) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, '330');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.blur();
  })()`);
  await sleep(500);
  const resized = await state();
  if (resized.w !== '330') throw new Error(`布尔组 W 未改成 330：${resized.w}`);
  await shot('shots/boolean-resized.png');
  await evaluate(`(() => {
    const label = [...document.querySelectorAll('.field')].find((el) => el.querySelector('.field-label')?.textContent.trim() === 'W');
    const input = label?.querySelector('.field-input');
    if (!input) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, '220');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.blur();
  })()`);
  await sleep(450);

  await evaluate(`(() => {
    const btn = [...document.querySelectorAll('.boolean-bar-item')].find((el) => el.textContent.trim() === '并集');
    btn?.click();
  })()`);
  await sleep(500);
  const switched = await state();
  if (switched.barActive !== '并集' || switched.rightActive !== '并集') throw new Error(`切换并集失败：${switched.barActive}/${switched.rightActive}`);
  await shot('shots/boolean-union.png');

  await evaluate(`(() => {
    const btn = [...document.querySelectorAll('.boolean-bar-item')].find((el) => el.textContent.trim() === '差集');
    btn?.click();
  })()`);
  await sleep(450);

  await evaluate(`(() => {
    document.querySelector('.bool-btn')?.click();
  })()`);
  await sleep(200);
  await evaluate(`(() => {
    const btn = [...document.querySelectorAll('.bool-menu-item')].find((el) => el.textContent.trim().startsWith('拍平'));
    btn?.click();
  })()`);
  await sleep(550);
  const flattened = await state();
  if (flattened.selected[0] !== '拍平 1') throw new Error(`拍平结果不对：${flattened.selected[0]}`);
  if (flattened.selectedType !== '矢量' && flattened.selectedType !== '钢笔') throw new Error(`拍平后类型不对：${flattened.selectedType}`);
  if (flattened.selectedCaret) throw new Error('拍平后仍有展开箭头');
  if (flattened.layerNames.includes('红块') || flattened.layerNames.includes('蓝块')) throw new Error(`拍平后子层仍残留：${flattened.layerNames.join('/')}`);
  await shot('shots/boolean-flattened.png');

  await evaluate(`(() => document.querySelector('[aria-label="撤销"]')?.click())()`);
  await sleep(450);
  const undone = await state();
  if (undone.selectedType !== '布尔组' || !undone.selectedCaret) throw new Error(`撤销未恢复布尔组：${undone.selectedType}`);

  console.log('BEFORE', JSON.stringify(before));
  console.log('CREATED', JSON.stringify(created));
  console.log('EXPANDED', JSON.stringify(expanded));
  console.log('RESIZED', JSON.stringify(resized));
  console.log('SWITCHED', JSON.stringify(switched));
  console.log('FLATTENED', JSON.stringify(flattened));
  console.log('UNDONE', JSON.stringify(undone));
  ws.close();
}

main().catch((error) => { console.error(error); process.exit(1); });

