// Multi-leg mission ("Grand Tour") evaluation: chained Lambert legs patched
// with gravity-assist flybys at each intermediate planet.

import { planetState, planetStates, type StateKm } from './ephemeris';
import { evaluateFlyby, type FlybyResult } from './flyby';
import { solveLambert } from './lambert';
import { orbitLoop, type Mission, TRAJECTORY_SAMPLES } from './mission';
import { DAY_MS, DAY_S, MU_SUN, PLANETS, PLANET_IDS, type PlanetId } from './orbitalConstants';
import { captureBurnDv, departureBurnDv } from './porkchop';
import { propagateKepler } from './propagate';
import { norm, sub, type Vec3 } from './vec';

export type StateProvider = (planet: PlanetId, ms: number) => StateKm;

export interface TourLeg {
  from: PlanetId;
  to: PlanetId;
  departMs: number;
  arriveMs: number;
  tofDays: number;
  v1: Vec3;
  v2: Vec3;
}

export interface TourFlyby extends FlybyResult {
  planet: PlanetId;
  ms: number;
}

export interface TourEvaluation {
  route: PlanetId[];
  departMs: number;
  legTofDays: number[];
  legs: TourLeg[];
  flybys: TourFlyby[];
  depC3: number;
  depVinf: number;
  arrVinf: number;
  dvDepart: number;
  dvFlybys: number;
  dvCapture: number;
  dvTotal: number;
  totalTofDays: number;
  feasible: boolean;
  finish: TourFinish;
}

/** How the tour ends at the target: propulsive capture, aerocapture, or plain flyby. */
export type TourFinish = 'capture' | 'aerocapture' | 'flyby';

export interface TourOptions {
  finish?: TourFinish;
}

/**
 * Evaluate a full tour: route[0] → route[1] → … with the given departure and
 * per-leg flight times. Cheap (no trajectory sampling) — safe to call in
 * optimizer loops. Returns null when any Lambert leg fails.
 */
export function evaluateTour(
  route: PlanetId[],
  departMs: number,
  legTofDays: number[],
  opts: TourOptions = {},
  state: StateProvider = planetState,
): TourEvaluation | null {
  if (route.length < 2 || legTofDays.length !== route.length - 1) return null;
  if (legTofDays.some((t) => !(t > 2))) return null;

  const times: number[] = [departMs];
  for (const tof of legTofDays) times.push(times[times.length - 1] + tof * DAY_MS);

  const states = route.map((p, i) => state(p, times[i]));
  const legs: TourLeg[] = [];

  for (let i = 0; i < route.length - 1; i++) {
    const sols = solveLambert(
      states[i].r,
      states[i + 1].r,
      legTofDays[i] * DAY_S,
      MU_SUN,
      { prograde: true, maxRevs: 0 },
    );
    if (sols.length === 0 || !Number.isFinite(sols[0].v1[0])) return null;
    legs.push({
      from: route[i],
      to: route[i + 1],
      departMs: times[i],
      arriveMs: times[i + 1],
      tofDays: legTofDays[i],
      v1: sols[0].v1,
      v2: sols[0].v2,
    });
  }

  const depVinfVec = sub(legs[0].v1, states[0].v);
  const depVinf = norm(depVinfVec);
  const dvDepart = departureBurnDv(depVinf, route[0]);

  const flybys: TourFlyby[] = [];
  let dvFlybys = 0;
  for (let k = 1; k < route.length - 1; k++) {
    const vinfIn = sub(legs[k - 1].v2, states[k].v);
    const vinfOut = sub(legs[k].v1, states[k].v);
    const fb = evaluateFlyby(vinfIn, vinfOut, route[k]);
    flybys.push({ ...fb, planet: route[k], ms: times[k] });
    dvFlybys += fb.dv;
  }

  const last = legs[legs.length - 1];
  const arrVinf = norm(sub(last.v2, states[states.length - 1].v));
  const finish = opts.finish ?? 'capture';
  const dvCapture =
    finish === 'flyby'
      ? 0
      : captureBurnDv(arrVinf, route[route.length - 1], finish === 'aerocapture');

  return {
    route,
    departMs,
    legTofDays,
    legs,
    flybys,
    depC3: depVinf * depVinf,
    depVinf,
    arrVinf,
    dvDepart,
    dvFlybys,
    dvCapture,
    dvTotal: dvDepart + dvFlybys + dvCapture,
    totalTofDays: (times[times.length - 1] - departMs) / DAY_MS,
    feasible: true,
    finish,
  };
}

/**
 * Build a Mission-shaped object for a tour so the 3D scene, 2D diagram and
 * report can render it: concatenated per-leg conic samples + planet motion
 * over the whole tour.
 */
export function buildTourMission(evaluation: TourEvaluation): Mission {
  const { route, legs } = evaluation;
  const departMs = legs[0].departMs;
  const arriveMs = legs[legs.length - 1].arriveMs;

  // sample the whole tour uniformly in time so the craft coincides with each
  // planet exactly at its flyby epoch in the animation
  const N = Math.max(TRAJECTORY_SAMPLES, 160 * legs.length);
  const totalMs = arriveMs - departMs;
  const legStates = legs.map((leg) => planetState(leg.from, leg.departMs));
  const trajectory: Vec3[] = [];
  for (let j = 0; j <= N; j++) {
    const t = departMs + (totalMs * j) / N;
    let k = legs.length - 1;
    while (k > 0 && legs[k].departMs > t) k--;
    const dtSec = (t - legs[k].departMs) / 1000;
    trajectory.push(propagateKepler(legStates[k].r, legs[k].v1, dtSec, MU_SUN).r);
  }

  const maxActiveAu = Math.max(...route.map((p) => PLANETS[p].semiMajorAxisAu));
  const planetIds = PLANET_IDS.filter(
    (id) => route.includes(id) || PLANETS[id].semiMajorAxisAu < maxActiveAu * 2.2,
  );

  const nSamples = trajectory.length - 1;
  const sampleTimes = Array.from(
    { length: nSamples + 1 },
    (_, i) => departMs + (totalMs * i) / nSamples,
  );
  const planetPaths: Partial<Record<PlanetId, Vec3[]>> = {};
  const orbitLoops: Partial<Record<PlanetId, Vec3[]>> = {};
  for (const id of planetIds) {
    planetPaths[id] = planetStates(id, sampleTimes).map((s) => s.r);
    orbitLoops[id] = orbitLoop(id, departMs);
  }

  const depState = planetState(route[0], departMs);
  const arrState = planetState(route[route.length - 1], arriveMs);

  return {
    departPlanet: route[0],
    arrivePlanet: route[route.length - 1],
    departMs,
    arriveMs,
    tofDays: evaluation.totalTofDays,
    depState,
    arrState,
    v1: legs[0].v1,
    v2: legs[legs.length - 1].v2,
    depVinf: evaluation.depVinf,
    depC3: evaluation.depC3,
    arrVinf: evaluation.arrVinf,
    dvDepart: evaluation.dvDepart,
    dvCapture: evaluation.dvCapture,
    dvTotal: evaluation.dvTotal,
    trajectory,
    planetIds,
    planetPaths,
    orbitLoops,
    routePlanets: route,
    flybys: evaluation.flybys.map((f) => ({ planet: f.planet, ms: f.ms })),
  };
}

export interface TourPreset {
  id: string;
  name: string;
  route: PlanetId[];
  departIso: string;
  legTofDays: number[];
  finish: TourFinish;
  note: string;
}

export const TOUR_PRESETS: TourPreset[] = [
  {
    id: 'voyager2',
    name: 'Voyager 2 (1977)',
    route: ['Earth', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'],
    departIso: '1977-08-20',
    legTofDays: [688, 778, 1612, 1309],
    finish: 'flyby',
    note: 'the actual Grand Tour — once every 175 years',
  },
  {
    id: 'ejs',
    name: 'Earth–Jupiter–Saturn',
    route: ['Earth', 'Jupiter', 'Saturn'],
    departIso: '2027-03-01',
    legTofDays: [900, 1500],
    finish: 'capture',
    note: 'Jupiter assist to Saturn, Cassini-style capture',
  },
  {
    id: 'evm',
    name: 'Earth–Venus–Mars',
    route: ['Earth', 'Venus', 'Mars'],
    departIso: '2026-10-01',
    legTofDays: [150, 300],
    finish: 'aerocapture',
    note: 'inner-system tour via Venus, aerocapture at Mars',
  },
];
