// Web Worker: runs the tour optimizer off the main thread.

import { optimizeTour, type OptimizeRequest, type OptimizeResult } from '../lib/tourOptimizer';

export type TourWorkerResponse =
  | { type: 'progress'; evals: number; bestDv: number }
  | { type: 'result'; result: OptimizeResult | null };

self.onmessage = (e: MessageEvent<OptimizeRequest>) => {
  let lastPost = 0;
  const result = optimizeTour(e.data, (evals, bestDv) => {
    const now = performance.now();
    if (now - lastPost > 80) {
      lastPost = now;
      (self as unknown as Worker).postMessage({ type: 'progress', evals, bestDv });
    }
  });
  (self as unknown as Worker).postMessage({ type: 'result', result });
};
