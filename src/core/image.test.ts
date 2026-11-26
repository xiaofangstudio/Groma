import { describe, expect, it } from 'vitest';
import { FULL_IMAGE_CROP, imageCropOf, imageSourceRect, normalizeImageCrop } from './image';
import type { SceneNode } from './types';

function imageNode(crop?: SceneNode['imageCrop']): SceneNode {
  return {
    id: 'image-a',
    type: 'image',
    name: '图片',
    parentId: null,
    children: [],
    x: 0,
    y: 0,
    w: 300,
    h: 200,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    clipContent: false,
    fills: [],
    cornerRadius: 0,
    assetId: 'asset-a',
    imageCrop: crop,
  };
}

describe('图片裁剪', () => {
  it('旧工程没有裁剪字段时按整张图', () => {
    expect(imageCropOf(imageNode())).toEqual(FULL_IMAGE_CROP);
    expect(normalizeImageCrop(null)).toEqual(FULL_IMAGE_CROP);
    expect(normalizeImageCrop({ x: Number.NaN, y: 0, w: 1, h: 1 })).toEqual(FULL_IMAGE_CROP);
  });

  it('越界裁剪收拢到 0–1 且至少保留 2%', () => {
    expect(normalizeImageCrop({ x: -0.2, y: 0.9, w: 1.4, h: 0 })).toEqual({ x: 0, y: 0.9, w: 1, h: 0.02 });
    expect(normalizeImageCrop({ x: 0.5, y: 0.5, w: 0.8, h: 0.8 })).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
  });

  it('归一化区域换算成原图像素矩形', () => {
    const source = imageSourceRect(1200, 800, { x: 0.25, y: 0.5, w: 0.5, h: 0.25 });
    expect(source).toEqual({ x: 300, y: 400, w: 600, h: 200 });
  });

  it('节点上保存的裁剪值会先归一化再读取', () => {
    expect(imageCropOf(imageNode({ x: 0.2, y: 0.1, w: 0.6, h: 0.5 }))).toEqual({ x: 0.2, y: 0.1, w: 0.6, h: 0.5 });
    expect(imageCropOf(imageNode({ x: 0.8, y: 0.1, w: 0.6, h: 0.5 }))).toEqual({ x: 0.8, y: 0.1, w: 0.2, h: 0.5 });
  });
});
