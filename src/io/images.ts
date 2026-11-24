import type { GromaDoc, ImageAsset } from '../core/types';
import { readAsset, writeAsset } from './project';

/**
 * 位图资产缓存。
 *
 * scene.json 只存 assets/<id>.png 这样的引用；图片本体在工程 assets 目录。
 * 画布、缩略图和导出共用同一份 HTMLImageElement，避免每次绘制都重新解码。
 */

interface ImageEntry {
  asset: ImageAsset;
  dataUrl: string | null;
  image: HTMLImageElement | null;
  status: 'idle' | 'loading' | 'ready' | 'missing';
  promise: Promise<boolean> | null;
}

const cache = new Map<string, ImageEntry>();
const listeners = new Set<() => void>();
let projectId: string | null = null;
let assetSeq = 0;

function notify() {
  for (const listener of listeners) listener();
}

export function subscribeImages(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setImageProject(id: string | null) {
  projectId = id;
}

export function getImageProjectId(): string | null {
  return projectId;
}

function makeImage(dataUrl: string): Promise<HTMLImageElement | null> {
  if (typeof Image === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = dataUrl;
  });
}

function fallbackMime(file: File): string {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  return file.type;
}

export function imageMime(file: File): string | null {
  const mime = fallbackMime(file);
  return ['image/png', 'image/jpeg', 'image/webp'].includes(mime) ? mime : null;
}

export function isImageFile(file: File): boolean {
  return imageMime(file) !== null;
}

function readFileDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

async function imageSize(dataUrl: string): Promise<{ w: number; h: number }> {
  const image = await makeImage(dataUrl);
  if (!image || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    throw new Error('图片无法解码');
  }
  return { w: image.naturalWidth, h: image.naturalHeight };
}

function ensureEntry(asset: ImageAsset): ImageEntry {
  let entry = cache.get(asset.id);
  if (!entry) {
    entry = { asset, dataUrl: null, image: null, status: 'idle', promise: null };
    cache.set(asset.id, entry);
  } else {
    entry.asset = asset;
  }
  return entry;
}

async function finishEntry(entry: ImageEntry, dataUrl: string): Promise<boolean> {
  entry.dataUrl = dataUrl;
  const image = await makeImage(dataUrl);
  entry.image = image;
  entry.status = image ? 'ready' : 'missing';
  notify();
  return Boolean(image);
}

export async function registerImageAsset(asset: ImageAsset, dataUrl: string): Promise<boolean> {
  const entry = ensureEntry(asset);
  entry.status = 'loading';
  entry.dataUrl = dataUrl;
  entry.promise = finishEntry(entry, dataUrl);
  notify();
  return entry.promise;
}

async function ensureImageAsset(asset: ImageAsset): Promise<boolean> {
  const entry = ensureEntry(asset);
  if (entry.status === 'ready') return true;
  if (entry.promise) return entry.promise;
  if (!projectId) {
    entry.status = 'missing';
    notify();
    return false;
  }
  entry.status = 'loading';
  notify();
  entry.promise = (async () => {
    try {
      const dataUrl = entry.dataUrl ?? (await readAsset(projectId as string, asset.file));
      return await finishEntry(entry, dataUrl);
    } catch {
      entry.status = 'missing';
      notify();
      return false;
    } finally {
      entry.promise = null;
    }
  })();
  return entry.promise;
}

export function requestImageAsset(asset: ImageAsset): void {
  if (cache.get(asset.id)?.status === 'ready') return;
  void ensureImageAsset(asset);
}

export async function hydrateDocImages(doc: GromaDoc, id: string): Promise<void> {
  projectId = id;
  const assets = Object.values(doc.assets ?? {});
  await Promise.all(assets.map((asset) => ensureImageAsset(asset)));
}

export async function preloadDocImages(doc: GromaDoc): Promise<void> {
  const assets = Object.values(doc.assets ?? {});
  await Promise.all(assets.map((asset) => ensureImageAsset(asset)));
}

export function getAssetImage(assetId: string): HTMLImageElement | null {
  return cache.get(assetId)?.status === 'ready' ? (cache.get(assetId)?.image ?? null) : null;
}

export function getAssetDataUrl(assetId: string): string | null {
  return cache.get(assetId)?.dataUrl ?? null;
}

export interface ImportedImage {
  asset: ImageAsset;
  dataUrl: string;
}

export async function importImageAsset(id: string, file: File): Promise<ImportedImage> {
  const mime = imageMime(file);
  if (!mime) throw new Error('只支持 PNG / JPG / WebP 图片');
  if (file.size > 48_000_000) throw new Error('图片超过 48MB，先压缩再导入');
  const dataUrl = await readFileDataUrl(file);
  const comma = dataUrl.indexOf(',');
  if (comma < 0) throw new Error('图片数据无效');
  const base64 = dataUrl.slice(comma + 1);
  const size = await imageSize(dataUrl);
  const stored = await writeAsset(id, file.name, mime, base64);
  assetSeq += 1;
  const asset: ImageAsset = {
    id: `asset-${Date.now().toString(36)}-${assetSeq}`,
    name: file.name.slice(0, 40) || '图片',
    mime: stored.mime,
    file: stored.file,
    w: size.w,
    h: size.h,
    bytes: stored.bytes,
  };
  await registerImageAsset(asset, dataUrl);
  return { asset, dataUrl };
}
