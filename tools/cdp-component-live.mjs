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

  const MASTER = 'frame-mx013ysx-8';
  const INSTANCE = 'frame-mx013zz7-10';
  const MASTER_TEXT = 'text-mx014213-12';

  const ensureOpen = async (nodeId) => evaluate(`(() => {
    const row = document.querySelector('.layer-row[data-node-id="${nodeId}"]');
    if (!row) return false;
    if (row.getAttribute('aria-expanded') !== 'true') row.querySelector('.layer-caret')?.click();
    return true;
  })()`);
  const selectNode = async (nodeId) => evaluate(`(() => {
    const row = document.querySelector('.layer-row[data-node-id="${nodeId}"]');
    row?.click();
    return Boolean(row);
  })()`);
  const instanceChild = async () => evaluate(`(() => {
    const rows = [...document.querySelectorAll('.layer-row')];
    const root = document.querySelector('.layer-row[data-node-id="${INSTANCE}"]');
    const index = rows.indexOf(root);
    return index >= 0 ? rows[index + 1]?.dataset.nodeId ?? null : null;
  })()`);
  const textValue = async () => evaluate(`document.querySelector('#text-editor')?.value ?? null`);
  const setText = async (text) => evaluate(`(() => {
    const ta = document.querySelector('#text-editor');
    if (!ta) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    ta.focus();
    setter.call(ta, '${text}');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.blur();
    return true;
  })()`);
  const undo = async () => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ', modifiers: 2, windowsVirtualKeyCode: 90 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', modifiers: 2, windowsVirtualKeyCode: 90 });
  };
  const redo = async () => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'y', code: 'KeyY', modifiers: 2, windowsVirtualKeyCode: 89 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'y', code: 'KeyY', modifiers: 2, windowsVirtualKeyCode: 89 });
  };

  await ensureOpen(MASTER);
  await sleep(350);
  await ensureOpen(INSTANCE);
  await sleep(350);
  await selectNode(MASTER_TEXT);
  await sleep(600);
  console.log('MASTER_BEFORE', JSON.stringify({ text: await textValue() }));

  await setText('主组件自动联动');
  await sleep(1200);
  await ensureOpen(INSTANCE);
  await sleep(300);
  const instanceTextId = await instanceChild();
  await selectNode(instanceTextId);
  await sleep(600);
  console.log('INSTANCE_AFTER_EDIT', JSON.stringify({ instanceTextId, text: await textValue() }));

  await undo();
  await sleep(1000);
  await ensureOpen(INSTANCE);
  await sleep(300);
  const undoneInstanceText = await instanceChild();
  await selectNode(MASTER_TEXT);
  await sleep(500);
  const masterUndoText = await textValue();
  await selectNode(undoneInstanceText);
  await sleep(500);
  console.log('AFTER_UNDO', JSON.stringify({ masterUndoText, instanceTextId: undoneInstanceText, text: await textValue() }));

  await redo();
  await sleep(1000);
  await ensureOpen(INSTANCE);
  await sleep(300);
  const redoInstanceText = await instanceChild();
  await selectNode(MASTER_TEXT);
  await sleep(500);
  const masterRedoText = await textValue();
  await selectNode(redoInstanceText);
  await sleep(500);
  console.log('AFTER_REDO', JSON.stringify({ masterRedoText, instanceTextId: redoInstanceText, text: await textValue() }));

  await selectNode(MASTER_TEXT);
  await sleep(500);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: '1', code: 'Digit1', modifiers: 8, windowsVirtualKeyCode: 49 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: '1', code: 'Digit1', modifiers: 8, windowsVirtualKeyCode: 49 });
  await sleep(800);
  const panel = await evaluate(`(() => ({
    overflow: [...document.querySelectorAll('.right-panel *')]
      .filter((el) => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1)
      .slice(0, 10)
      .map((el) => ({ cls: String(el.className).slice(0, 40), text: (el.textContent || '').trim().slice(0, 24), cw: el.clientWidth, sw: el.scrollWidth })),
  }))()`);
  console.log('PANEL', JSON.stringify(panel));
  await sleep(500);
  ws.close();
}
main().catch((error) => { console.error(error); process.exit(1); });
