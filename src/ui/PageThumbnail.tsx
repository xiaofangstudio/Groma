import { useEffect, useRef, useState } from 'react';
import type { GromaDoc, Page } from '../core/types';
import { drawPageThumbnail } from '../render/draw';
import { subscribeImages } from '../io/images';

const THUMB_W = 34;
const THUMB_H = 22;
const THUMB_DELAY_MS = 100;
const THUMB_STAGGER_MS = 8;

/** 页行左侧的实页面缩略图；只跟随当前页重画，并延后合并，避免和主画布抢同一帧。 */
export function PageThumbnail({
  doc,
  page,
  active,
  index = 0,
}: {
  doc: GromaDoc;
  page: Page;
  active: boolean;
  index?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawnRef = useRef(false);
  const [assetTick, setAssetTick] = useState(0);
  const source = active ? doc : null;

  useEffect(() => {
    return subscribeImages(() => setAssetTick((tick) => tick + 1));
  }, []);

  useEffect(() => {
    if (!source && drawnRef.current) return;
    const delay = drawnRef.current ? THUMB_DELAY_MS : Math.min(index * THUMB_STAGGER_MS, 160);
    const timer = window.setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      drawPageThumbnail(canvas, doc, page, THUMB_W, THUMB_H);
      drawnRef.current = true;
    }, delay);
    return () => window.clearTimeout(timer);
  }, [source, page, index, assetTick]);

  return (
    <canvas
      ref={canvasRef}
      className="page-thumb"
      width={THUMB_W * 2}
      height={THUMB_H * 2}
      aria-hidden="true"
    />
  );
}
