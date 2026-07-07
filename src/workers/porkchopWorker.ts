// Web Worker: computes the full Lambert grid off the main thread and streams
// progress back so the UI can animate a scan while contours are being solved.

import { computePorkchopGrid, type PorkchopParams } from '../lib/porkchop';

export interface ComputeRequest {
  params: PorkchopParams;
}

export type ComputeResponse =
  | { type: 'progress'; fraction: number }
  | { type: 'result'; grid: ReturnType<typeof computePorkchopGrid> };

self.onmessage = (e: MessageEvent<ComputeRequest>) => {
  const { params } = e.data;
  let lastPost = 0;
  const grid = computePorkchopGrid(params, (fraction) => {
    const now = performance.now();
    if (fraction >= 1 || now - lastPost > 40) {
      lastPost = now;
      (self as unknown as Worker).postMessage({ type: 'progress', fraction });
    }
  });
  (self as unknown as Worker).postMessage({ type: 'result', grid }, [
    grid.totalDv.buffer,
    grid.depC3.buffer,
    grid.depVinf.buffer,
    grid.arrVinf.buffer,
    grid.tofDays.buffer,
  ]);
};
