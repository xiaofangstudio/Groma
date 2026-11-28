import fs from 'node:fs';
import path from 'node:path';

const port = process.env.CDP_PORT || '9241';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const root = 'C:/Users/ASUS/Documents/Groma';

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
  await send('Page.enable');

  for (let i = 0; i < 40; i += 1) {
    if (await evaluate(`Boolean(document.querySelector('.welcome'))`)) break;
    await sleep(250);
  }
  await sleep(400);

  const snapshot = () => evaluate(`(() => {
    const cards = [...document.querySelectorAll('.recent-card')];
    const menu = document.querySelector('.home-context-menu');
    return {
      count: cards.length,
      names: cards.slice(0, 4).map((c) => c.querySelector('.recent-name')?.textContent || ''),
      menu: menu ? [...menu.querySelectorAll('.canvas-context-item')].map((b) => b.textContent.replace(/\\s+/g, ' ').trim()) : null,
      note: menu?.querySelector('.canvas-context-note')?.textContent?.trim() || null,
      toast: document.querySelector('.home-toast')?.textContent?.replace(/\\s+/g, ' ').trim() || null,
    };
  })()`);

  console.log('START', JSON.stringify(await snapshot()));

  const blank = await evaluate(`(() => {
    const w = document.querySelector('.welcome');
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 24, clientY: 120 });
    w.dispatchEvent(ev);
    return ev.defaultPrevented;
  })()`);
  await sleep(250);
  console.log('BLANK_MENU', JSON.stringify({ prevented: blank, state: await snapshot() }));
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await sleep(200);
  console.log('BLANK_CLOSED', JSON.stringify(await snapshot()));

  const cardPoint = await evaluate(`(() => {
    const card = document.querySelector('.recent-card');
    const r = card.getBoundingClientRect();
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 60, clientY: r.top + 34 });
    card.dispatchEvent(ev);
    return { prevented: ev.defaultPrevented, x: r.left + 60, y: r.top + 34 };
  })()`);
  await sleep(250);
  console.log('CARD_MENU', JSON.stringify({ point: cardPoint, state: await snapshot() }));

  const targetName = (await snapshot()).names[0];
  const projectDirs = fs.readdirSync(root).filter((name) => name.endsWith('.groma'));
  const dirForName = projectDirs.find((dir) => {
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(root, dir, 'project.json'), 'utf8'));
      return meta.name === targetName;
    } catch {
      return false;
    }
  });
  console.log('TARGET', JSON.stringify({ name: targetName, dir: dirForName || null }));

  const clicked = await evaluate(`(() => {
    const items = [...document.querySelectorAll('.home-context-menu .canvas-context-item')];
    const item = items.find((b) => b.textContent.includes('从最近移除'));
    item?.click();
    return Boolean(item);
  })()`);
  await sleep(700);
  const removedState = await snapshot();
  console.log('REMOVED', JSON.stringify({ clicked, state: removedState }));
  if (dirForName) {
    console.log('FILE_KEPT', JSON.stringify({ dir: dirForName, exists: fs.existsSync(path.join(root, dirForName, 'scene.json')) }));
  }

  const undo = await evaluate(`(() => {
    const btn = document.querySelector('.home-toast button');
    btn?.click();
    return Boolean(btn);
  })()`);
  await sleep(900);
  console.log('UNDO', JSON.stringify({ clicked: undo, state: await snapshot() }));

  const hoverPoint = await evaluate(`(() => {
    const card = document.querySelector('.recent-card');
    if (!card) return null;
    const r = card.getBoundingClientRect();
    return { x: r.left + 140, y: r.top + 43 };
  })()`);
  if (!hoverPoint) throw new Error('撤销后最近工程没有回到列表');
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hoverPoint.x, y: hoverPoint.y });
  await sleep(500);
  const hoverState = await evaluate(`(() => {
    const card = document.querySelector('.recent-card');
    const del = card?.querySelector('.recent-delete');
    return {
      hovered: Boolean(card?.matches(':hover')),
      deleteOpacity: del ? getComputedStyle(del).opacity : null,
      goOpacity: card ? getComputedStyle(card.querySelector('.recent-go')).opacity : null,
    };
  })()`);
  console.log('HOVER', JSON.stringify(hoverState));

  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.mkdirSync('D:/20533/deskbox/fangwork/Groma/shots', { recursive: true });
  fs.writeFileSync('D:/20533/deskbox/fangwork/Groma/shots/welcome-delete-hover.png', Buffer.from(shot.data, 'base64'));

  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: hoverPoint.x, y: hoverPoint.y, button: 'right', clickCount: 1 });
  await sleep(80);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: hoverPoint.x, y: hoverPoint.y, button: 'right', clickCount: 1 });
  await sleep(400);
  const menuState = await snapshot();
  console.log('FINAL_MENU', JSON.stringify(menuState));
  const geometry = await evaluate(`(() => {
    const menu = document.querySelector('.home-context-menu');
    if (!menu) return null;
    const r = menu.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight,
      overflow: [...menu.querySelectorAll('*')].filter((el) => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent.slice(0, 20)) };
  })()`);
  console.log('MENU_GEOMETRY', JSON.stringify(geometry));

  ws.close();
}
main().catch((error) => { console.error(error); process.exit(1); });
