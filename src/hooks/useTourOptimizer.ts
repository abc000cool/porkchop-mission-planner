import { useCallback, useEffect, useRef, useState } from 'react';
import type { OptimizeRequest, OptimizeResult } from '../lib/tourOptimizer';
import type { TourWorkerResponse } from '../workers/tourWorker';

export interface TourOptimizerState {
  running: boolean;
  evals: number;
  bestDv: number | null;
}

export function useTourOptimizer() {
  const [state, setState] = useState<TourOptimizerState>({
    running: false,
    evals: 0,
    bestDv: null,
  });
  const workerRef = useRef<Worker | null>(null);

  const cancel = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setState((s) => ({ ...s, running: false }));
  }, []);

  const optimize = useCallback((req: OptimizeRequest): Promise<OptimizeResult | null> => {
    workerRef.current?.terminate();
    const worker = new Worker(new URL('../workers/tourWorker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;
    setState({ running: true, evals: 0, bestDv: null });
    return new Promise((resolve) => {
      worker.onmessage = (e: MessageEvent<TourWorkerResponse>) => {
        if (e.data.type === 'progress') {
          const { evals, bestDv } = e.data;
          setState({ running: true, evals, bestDv: Number.isFinite(bestDv) ? bestDv : null });
        } else {
          setState((s) => ({ ...s, running: false }));
          worker.terminate();
          if (workerRef.current === worker) workerRef.current = null;
          resolve(e.data.result);
        }
      };
      worker.postMessage(req);
    });
  }, []);

  useEffect(() => () => workerRef.current?.terminate(), []);

  return { ...state, optimize, cancel };
}
