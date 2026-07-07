// Porkchop grid computation: one Lambert solution per (departure, arrival)
// date pair, with derived mission metrics. Pure — no DOM, runs in a Worker
// or in Node for validation.

import { planetStates, type StateKm } from './ephemeris';
import { solveLambert } from './lambert';
import { DAY_MS, DAY_S, MU_SUN, PLANETS, type PlanetId } from './orbitalConstants';
import { sub, norm } from './vec';

export interface PorkchopParams {
  departPlanet: PlanetId;
  arrivePlanet: PlanetId;
  departStartMs: number;
  departEndMs: number;
  arriveStartMs: number;
  arriveEndMs: number;
  /** Grid step, days. */
  stepDays: number;
  /** Arrival capture burn set to zero (atmosphere does the braking). */
  aerocapture?: boolean;
  /** Transfer direction. Default true (prograde). */
  prograde?: boolean;
  /** Max full revolutions; each cell keeps its cheapest branch. Default 0. */
  maxRevs?: number;
}

export interface GridMinimum {
  iDep: number;
  iArr: number;
  departMs: number;
  arriveMs: number;
  totalDv: number;
  depC3: number;
  depVinf: number;
  arrVinf: number;
  tofDays: number;
}

export interface PorkchopGrid {
  params: PorkchopParams;
  departDatesMs: number[];
  arriveDatesMs: number[];
  /** Row-major: value[iArr * nDep + iDep]. NaN = no valid transfer. */
  totalDv: Float64Array;
  depC3: Float64Array;
  depVinf: Float64Array;
  arrVinf: Float64Array;
  tofDays: Float64Array;
  min: GridMinimum | null;
}

/**
 * Δv to leave a circular parking orbit onto the departure hyperbola.
 * v_burn = sqrt(v∞² + 2μ/r) − sqrt(μ/r)
 */
export function departureBurnDv(vinfKms: number, planet: PlanetId): number {
  const p = PLANETS[planet];
  const r = p.radiusKm + p.parkingAltKm;
  return Math.sqrt(vinfKms * vinfKms + (2 * p.mu) / r) - Math.sqrt(p.mu / r);
}

/**
 * Δv to capture from the arrival hyperbola into the planet's reference
 * capture orbit (circular for terrestrials, high-ellipse for giants),
 * burning at periapsis. Zero if aerocapture is enabled and the planet has
 * a usable atmosphere.
 */
export function captureBurnDv(vinfKms: number, planet: PlanetId, aerocapture = false): number {
  const p = PLANETS[planet];
  if (aerocapture && p.hasAtmosphere) return 0;
  const rp = p.radiusKm + p.parkingAltKm;
  const ra = rp * p.captureApoRatio;
  const a = (rp + ra) / 2;
  const vHyperbolic = Math.sqrt(vinfKms * vinfKms + (2 * p.mu) / rp);
  const vCapture = Math.sqrt((2 * p.mu) / rp - p.mu / a);
  return vHyperbolic - vCapture;
}

export function gridDates(startMs: number, endMs: number, stepDays: number): number[] {
  const stepMs = stepDays * DAY_MS;
  const dates: number[] = [];
  for (let t = startMs; t <= endMs + 1; t += stepMs) dates.push(t);
  return dates;
}

/**
 * Compute the full porkchop grid. `onRow` fires after each arrival row with
 * completion fraction (for progress UI). Index convention matches d3-contour:
 * width = departDatesMs.length, values[iArr * width + iDep].
 */
/**
 * Distinct launch windows: local minima of the Δv surface, best-first,
 * de-duplicated so type-I/type-II lobes of the same window both survive but
 * near-identical cells don't.
 */
export function findTopWindows(grid: PorkchopGrid, k = 5): GridMinimum[] {
  const nDep = grid.departDatesMs.length;
  const nArr = grid.arriveDatesMs.length;
  const dv = grid.totalDv;
  const candidates: GridMinimum[] = [];

  // interior cells only — a minimum on the grid edge is a truncated window,
  // not a real one
  for (let iArr = 1; iArr < nArr - 1; iArr++) {
    for (let iDep = 1; iDep < nDep - 1; iDep++) {
      const idx = iArr * nDep + iDep;
      const v = dv[idx];
      if (!Number.isFinite(v)) continue;
      let isMin = true;
      for (let dy = -1; dy <= 1 && isMin; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const jArr = iArr + dy;
          const jDep = iDep + dx;
          if (jArr < 0 || jArr >= nArr || jDep < 0 || jDep >= nDep) continue;
          const nv = dv[jArr * nDep + jDep];
          if (Number.isFinite(nv) && nv < v) {
            isMin = false;
            break;
          }
        }
      }
      if (!isMin) continue;
      candidates.push({
        iDep,
        iArr,
        departMs: grid.departDatesMs[iDep],
        arriveMs: grid.arriveDatesMs[iArr],
        totalDv: v,
        depC3: grid.depC3[idx],
        depVinf: grid.depVinf[idx],
        arrVinf: grid.arrVinf[idx],
        tofDays: grid.tofDays[idx],
      });
    }
  }

  candidates.sort((a, b) => a.totalDv - b.totalDv);
  const picked: GridMinimum[] = [];
  const MERGE = 45 * DAY_MS;
  for (const c of candidates) {
    if (picked.length >= k) break;
    const dup = picked.some(
      (p) => Math.abs(p.departMs - c.departMs) < MERGE && Math.abs(p.arriveMs - c.arriveMs) < MERGE,
    );
    if (!dup) picked.push(c);
  }
  return picked;
}

export function computePorkchopGrid(
  params: PorkchopParams,
  onRow?: (fraction: number) => void,
): PorkchopGrid {
  const departDatesMs = gridDates(params.departStartMs, params.departEndMs, params.stepDays);
  const arriveDatesMs = gridDates(params.arriveStartMs, params.arriveEndMs, params.stepDays);
  const nDep = departDatesMs.length;
  const nArr = arriveDatesMs.length;
  const n = nDep * nArr;

  const depStates: StateKm[] = planetStates(params.departPlanet, departDatesMs);
  const arrStates: StateKm[] = planetStates(params.arrivePlanet, arriveDatesMs);

  const totalDv = new Float64Array(n).fill(NaN);
  const depC3 = new Float64Array(n).fill(NaN);
  const depVinf = new Float64Array(n).fill(NaN);
  const arrVinf = new Float64Array(n).fill(NaN);
  const tofDays = new Float64Array(n).fill(NaN);

  let min: GridMinimum | null = null;

  for (let iArr = 0; iArr < nArr; iArr++) {
    const arrMs = arriveDatesMs[iArr];
    const arrState = arrStates[iArr];
    for (let iDep = 0; iDep < nDep; iDep++) {
      const depMs = departDatesMs[iDep];
      const tofDaysVal = (arrMs - depMs) / DAY_MS;
      if (tofDaysVal <= 1) continue; // arrival must follow departure

      const depState = depStates[iDep];
      const sols = solveLambert(depState.r, arrState.r, tofDaysVal * DAY_S, MU_SUN, {
        prograde: params.prograde ?? true,
        maxRevs: params.maxRevs ?? 0,
      });
      if (sols.length === 0) continue;

      // keep the cheapest branch (matters only for multi-rev)
      let dv = Infinity;
      let vinfDep = NaN;
      let vinfArr = NaN;
      for (const sol of sols) {
        if (!Number.isFinite(sol.v1[0]) || !Number.isFinite(sol.v2[0])) continue;
        const vd = norm(sub(sol.v1, depState.v));
        const va = norm(sub(sol.v2, arrState.v));
        const cand =
          departureBurnDv(vd, params.departPlanet) +
          captureBurnDv(va, params.arrivePlanet, params.aerocapture);
        if (cand < dv) {
          dv = cand;
          vinfDep = vd;
          vinfArr = va;
        }
      }
      if (!Number.isFinite(dv)) continue;

      const idx = iArr * nDep + iDep;
      totalDv[idx] = dv;
      depC3[idx] = vinfDep * vinfDep;
      depVinf[idx] = vinfDep;
      arrVinf[idx] = vinfArr;
      tofDays[idx] = tofDaysVal;

      if (min === null || dv < min.totalDv) {
        min = {
          iDep,
          iArr,
          departMs: depMs,
          arriveMs: arrMs,
          totalDv: dv,
          depC3: vinfDep * vinfDep,
          depVinf: vinfDep,
          arrVinf: vinfArr,
          tofDays: tofDaysVal,
        };
      }
    }
    onRow?.((iArr + 1) / nArr);
  }

  return { params, departDatesMs, arriveDatesMs, totalDv, depC3, depVinf, arrVinf, tofDays, min };
}
