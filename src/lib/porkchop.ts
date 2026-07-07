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
        prograde: true,
        maxRevs: 0,
      });
      if (sols.length === 0) continue;
      const sol = sols[0];
      if (!Number.isFinite(sol.v1[0]) || !Number.isFinite(sol.v2[0])) continue;

      const vinfDep = norm(sub(sol.v1, depState.v));
      const vinfArr = norm(sub(sol.v2, arrState.v));
      const dv =
        departureBurnDv(vinfDep, params.departPlanet) +
        captureBurnDv(vinfArr, params.arrivePlanet, params.aerocapture);

      const idx = iArr * nDep + iDep;
      totalDv[idx] = dv;
      depC3[idx] = vinfDep * vinfDep;
      depVinf[idx] = vinfDep;
      arrVinf[idx] = vinfArr;
      tofDays[idx] = tofDaysVal;

      if (Number.isFinite(dv) && (min === null || dv < min.totalDv)) {
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
