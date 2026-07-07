// Coordinate-descent optimizer for tour variables (departure date + per-leg
// flight times), minimizing total Δv. Multi-start hill climbing with a
// shrinking step schedule — a preliminary-design scout, not a global MGA
// optimizer, and labeled as such in the UI.

import { planetState, type StateKm } from './ephemeris';
import { hohmannTofDays } from './defaults';
import { DAY_MS, type PlanetId } from './orbitalConstants';
import { evaluateTour, type StateProvider, type TourEvaluation, type TourFinish } from './tour';

export interface OptimizeRequest {
  route: PlanetId[];
  departMs: number;
  legTofDays: number[];
  /** Departure may move within ±this many days. */
  departSlackDays: number;
  finish: TourFinish;
}

export interface OptimizeResult {
  departMs: number;
  legTofDays: number[];
  evaluation: TourEvaluation;
  evals: number;
}

/** Ephemeris cache quantized to whole days — optimizer loops revisit dates. */
export function cachedStateProvider(): StateProvider {
  const cache = new Map<string, StateKm>();
  return (planet, ms) => {
    const day = Math.round(ms / DAY_MS);
    const key = `${planet}:${day}`;
    let s = cache.get(key);
    if (!s) {
      s = planetState(planet, day * DAY_MS);
      cache.set(key, s);
    }
    return s;
  };
}

export function optimizeTour(
  req: OptimizeRequest,
  onProgress?: (evals: number, bestDv: number) => void,
): OptimizeResult | null {
  const { route, finish } = req;
  const nLegs = route.length - 1;
  const state = cachedStateProvider();
  let evals = 0;

  const legBounds: [number, number][] = Array.from({ length: nLegs }, (_, i) => {
    const tH = hohmannTofDays(route[i], route[i + 1]);
    return [Math.max(20, 0.2 * tH), 4.5 * tH];
  });
  const depMin = req.departMs - req.departSlackDays * DAY_MS;
  const depMax = req.departMs + req.departSlackDays * DAY_MS;

  // vars: [departDay, tof1..tofN] in whole days
  const clampVars = (v: number[]) => {
    v[0] = Math.min(depMax / DAY_MS, Math.max(depMin / DAY_MS, v[0]));
    for (let i = 0; i < nLegs; i++) {
      v[i + 1] = Math.min(legBounds[i][1], Math.max(legBounds[i][0], v[i + 1]));
    }
    return v;
  };

  const objective = (v: number[]): number => {
    evals++;
    const ev = evaluateTour(
      route,
      Math.round(v[0]) * DAY_MS,
      v.slice(1).map(Math.round),
      { finish },
      state,
    );
    return ev ? ev.dvTotal : Infinity;
  };

  const base = clampVars([req.departMs / DAY_MS, ...req.legTofDays]);
  const starts: number[][] = [base.slice()];
  // deterministic jitter fans out around the seed
  const jitters = [0.85, 1.15, 0.7, 1.3];
  jitters.forEach((f, j) => {
    const v = base.slice();
    v[0] = base[0] + (j - 1.5) * (req.departSlackDays / 3);
    for (let i = 1; i < v.length; i++) v[i] = base[i] * f;
    starts.push(clampVars(v));
  });

  let bestV: number[] | null = null;
  let bestF = Infinity;

  for (const start of starts) {
    const v = start.slice();
    let f = objective(v);
    for (const step of [64, 32, 16, 8, 4, 2, 1]) {
      let improved = true;
      let guard = 0;
      while (improved && guard++ < 60) {
        improved = false;
        for (let i = 0; i < v.length; i++) {
          for (const dir of [1, -1]) {
            for (;;) {
              const trial = v.slice();
              trial[i] += dir * step;
              clampVars(trial);
              if (trial[i] === v[i]) break;
              const ft = objective(trial);
              if (ft < f - 1e-9) {
                v[i] = trial[i];
                f = ft;
                improved = true;
              } else break;
            }
          }
        }
        if (evals % 500 < v.length * 4) onProgress?.(evals, Math.min(bestF, f));
      }
    }
    if (f < bestF) {
      bestF = f;
      bestV = v.slice();
    }
  }

  if (!bestV || !Number.isFinite(bestF)) return null;
  const departMs = Math.round(bestV[0]) * DAY_MS;
  const legTofDays = bestV.slice(1).map(Math.round);
  const evaluation = evaluateTour(route, departMs, legTofDays, { finish }, state);
  if (!evaluation) return null;
  onProgress?.(evals, evaluation.dvTotal);
  return { departMs, legTofDays, evaluation, evals };
}
