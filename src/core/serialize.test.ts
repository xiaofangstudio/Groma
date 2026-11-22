import { describe, expect, it } from 'vitest';
import { createDoc } from './doc';
import { deserializeDoc, serializeDoc } from './serialize';
import type { GromaDoc, SceneNode } from './types';

describe('场景序列化', () => {
  it('序列化后往返一致', () => {
    const doc = createDoc('往返');
    const root = doc.nodes[doc.pages[0].rootId];
    const text: SceneNode = {
      id: 'text-1',
      type: 'text',
      name: '标题',
      parentId: root.children[0],
      children: [],
      x: 40,
      y: 50,
      w: 200,
      h: 40,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      clipContent: false,
      fills: [{ type: 'solid', color: '#221C00', opacity: 1 }],
      cornerRadius: 0,
      text: '你好',
      fontSize: 32,
      fontWeight: 700,
    };
    doc.nodes[text.id] = text;
    doc.nodes[root.children[0]].children.push(text.id);
    expect(deserializeDoc(serializeDoc(doc))).toEqual(doc);
  });

  it('手动参考线可以往返保存', () => {
    const doc = createDoc('参考线往返');
    doc.pages[0].guides = [
      { axis: 'x', position: 320 },
      { axis: 'y', position: 180 },
    ];
    expect(deserializeDoc(serializeDoc(doc))).toEqual(doc);
  });

  it('拒绝把损坏场景写出去', () => {
    const doc = createDoc('损坏') as GromaDoc;
    const frame = doc.nodes[doc.pages[0].rootId].children[0];
    doc.nodes[frame].opacity = 3;
    expect(() => serializeDoc(doc)).toThrow('拒绝写入损坏场景');
  });

  it('拒绝解析失败和结构损坏的场景', () => {
    expect(() => deserializeDoc('{ nope')).toThrow('场景 JSON 无法解析');
    expect(() => deserializeDoc(JSON.stringify({ version: 2 }))).toThrow('不支持的场景版本');
    expect(() => deserializeDoc(JSON.stringify(createDoc('ok')))).not.toThrow();
  });
});
