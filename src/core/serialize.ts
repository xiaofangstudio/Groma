import { validateDoc } from './schema';
import type { GromaDoc } from './types';

/**
 * 场景落盘的唯一入口：先校验再序列化。
 * 这样即使 UI 层出了 bug，也不会把结构性损坏写进 scene.json。
 */
export function serializeDoc(doc: GromaDoc): string {
  const validation = validateDoc(doc);
  if (!validation.ok) {
    throw new Error(`拒绝写入损坏场景：${validation.errors.slice(0, 3).join('；')}`);
  }
  return JSON.stringify(doc);
}

/**
 * 场景读取的唯一入口：解析失败或结构损坏都给出可读错误，而不是让渲染器崩掉。
 */
export function deserializeDoc(text: string): GromaDoc {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`场景 JSON 无法解析：${error instanceof Error ? error.message : String(error)}`);
  }
  const validation = validateDoc(parsed);
  if (!validation.ok) {
    throw new Error(`工程场景格式不正确：${validation.errors.slice(0, 3).join('；')}`);
  }
  return validation.doc;
}
