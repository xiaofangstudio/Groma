import { beforeEach, describe, expect, it } from 'vitest';
import { loadProjectUi, saveProjectUi } from './project-ui';

class MemoryStorage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

const memory = new MemoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: memory, configurable: true });

describe('工程界面记忆', () => {
  beforeEach(() => memory.clear());

  it('按工程保存当前页与视口，互不串工程', () => {
    saveProjectUi('a', { pageId: 'p1', viewports: { p1: { x: 12, y: 34, scale: 2 } } });
    saveProjectUi('b', { pageId: 'p2', viewports: { p2: { x: 5, y: 6, scale: 1 } } });

    expect(loadProjectUi('a')).toEqual({ pageId: 'p1', viewports: { p1: { x: 12, y: 34, scale: 2 } } });
    expect(loadProjectUi('b')?.pageId).toBe('p2');
    expect(loadProjectUi('missing')).toBeUndefined();
  });

  it('损坏 JSON 与非法视口不会带崩工程', () => {
    memory.setItem('groma:project-ui:v1:bad', '{oops');
    expect(loadProjectUi('bad')).toBeUndefined();

    memory.setItem(
      'groma:project-ui:v1:mixed',
      JSON.stringify({ pageId: 3, viewports: { good: { x: 1, y: 2, scale: 4 }, bad: { x: 'x', y: 2, scale: 1 } } }),
    );
    expect(loadProjectUi('mixed')).toEqual({ viewports: { good: { x: 1, y: 2, scale: 4 } } });
  });
});
