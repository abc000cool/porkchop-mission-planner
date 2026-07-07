// Composite mission difficulty score: total Δv, flight time, and how narrow
// the launch window is. 0 = trivial, 100 = extreme. Heuristic by design —
// meant for comparing candidate missions, not absolute judgement.

import { DAY_MS } from './orbitalConstants';
import type { GridMinimum, PorkchopGrid } from './porkchop';

export interface Difficulty {
  score: number;
  label: string;
  color: string;
  /** Days around the optimum where Δv stays within +0.75 km/s. */
  windowDays: number;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function missionDifficulty(grid: PorkchopGrid, min: GridMinimum): Difficulty {
  const nDep = grid.departDatesMs.length;
  const stepDays = (grid.departDatesMs[1] - grid.departDatesMs[0]) / DAY_MS;
  const row = min.iArr * nDep;
  const limit = min.totalDv + 0.75;

  let lo = min.iDep;
  while (lo > 0 && grid.totalDv[row + lo - 1] < limit) lo--;
  let hi = min.iDep;
  while (hi < nDep - 1 && grid.totalDv[row + hi + 1] < limit) hi++;
  const windowDays = (hi - lo + 1) * stepDays;

  const dvScore = clamp01((min.totalDv - 4) / 14) * 55; // 4 km/s easy → 18 km/s brutal
  const tofScore = clamp01((min.tofDays - 100) / 2400) * 30; // months → decades
  const windowScore = clamp01(1 - windowDays / 60) * 15; // < 2 months is tight

  const score = Math.round(dvScore + tofScore + windowScore);
  const [label, color] =
    score < 25
      ? ['routine', '#4ade80']
      : score < 45
        ? ['moderate', '#3ab0ff']
        : score < 65
          ? ['demanding', '#ffb347']
          : score < 85
            ? ['hard', '#ff8a5a']
            : ['extreme', '#ff5a6a'];

  return { score, label, color, windowDays };
}
