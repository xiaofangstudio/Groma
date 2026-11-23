import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { createDoc } from '../core/doc';
import { saveProject } from './project';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

describe('保存队列', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    Object.defineProperty(globalThis, 'window', {
      value: { __TAURI_INTERNALS__: {} },
      configurable: true,
    });
  });

  it('同一工程的两次保存串行执行，后写不可能先落盘', async () => {
    const resolvers: Array<(value: unknown) => void> = [];
    vi.mocked(invoke).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    );

    const first = createDoc('第一次');
    const second = createDoc('第二次');
    const p1 = saveProject('queue-test', first);
    const p2 = saveProject('queue-test', second);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(invoke).toHaveBeenCalledTimes(1);
    resolvers[0](undefined);
    await p1;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(invoke).toHaveBeenCalledTimes(2);

    const firstJson = vi.mocked(invoke).mock.calls[0][1] as { sceneJson: string };
    const secondJson = vi.mocked(invoke).mock.calls[1][1] as { sceneJson: string };
    expect(JSON.parse(firstJson.sceneJson).name).toBe('第一次');
    expect(JSON.parse(secondJson.sceneJson).name).toBe('第二次');

    resolvers[1](undefined);
    await p2;
  });

  it('手动存版本前的保存可以跳过额外快照', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await saveProject('manual-test', createDoc('手动'), false);
    const args = vi.mocked(invoke).mock.calls[0][1] as { snapshotBefore: boolean };
    expect(args.snapshotBefore).toBe(false);
  });
});
