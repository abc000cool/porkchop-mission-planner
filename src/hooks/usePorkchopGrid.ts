import { useEffect, useRef, useState } from 'react';
import type { PorkchopGrid, PorkchopParams } from '../lib/porkchop';
import type { ComputeResponse } from '../workers/porkchopWorker';

export interface PorkchopComputeState {
  grid: PorkchopGrid | null;
  computing: boolean;
  progress: number;
  elapsedMs: number;
}

/**
 * Debounced, cancellable porkchop grid computation in a Web Worker.
 * Changing params mid-compute terminates the stale worker and restarts.
 */
export function usePorkchopGrid(params: PorkchopParams): PorkchopComputeState {
  const [state, setState] = useState<PorkchopComputeState>({
    grid: null,
    computing: true,
    progress: 0,
    elapsedMs: 0,
  });
  const workerRef = useRef<Worker | null>(null);
  const genRef = useRef(0);

  const key = JSON.stringify(params);

  useEffect(() => {
    const gen = ++genRef.current;
    const timer = setTimeout(() => {
      workerRef.current?.terminate();
      const worker = new Worker(new URL('../workers/porkchopWorker.ts', import.meta.url), {
        type: 'module',
      });
      workerRef.current = worker;
      const t0 = performance.now();
      setState((prev) => ({ ...prev, computing: true, progress: 0 }));

      worker.onmessage = (e: MessageEvent<ComputeResponse>) => {
        if (genRef.current !== gen) return;
        if (e.data.type === 'progress') {
          const { fraction } = e.data;
          setState((prev) => ({ ...prev, progress: fraction }));
        } else {
          setState({
            grid: e.data.grid,
            computing: false,
            progress: 1,
            elapsedMs: performance.now() - t0,
          });
          worker.terminate();
          if (workerRef.current === worker) workerRef.current = null;
        }
      };
      worker.postMessage({ params: JSON.parse(key) });
    }, 300);

    return () => clearTimeout(timer);
  }, [key]);

  useEffect(
    () => () => {
      workerRef.current?.terminate();
    },
    [],
  );

  return state;
}
