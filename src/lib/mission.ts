// Builds a fully-resolved locked-in mission from a (departure, arrival) date
// pair: Lambert solution, burn breakdown, sampled transfer trajectory, and
// planet motion paths for the 2D/3D visualizations.

import { planetState, planetStates, type StateKm } from './ephemeris';
import { solveLambert } from './lambert';
import { DAY_MS, DAY_S, MU_SUN, PLANETS, PLANET_IDS, type PlanetId } from './orbitalConstants';
import { captureBurnDv, departureBurnDv } from './porkchop';
import { sampleConic } from './propagate';
import { norm, sub, type Vec3 } from './vec';

export interface Mission {
  departPlanet: PlanetId;
  arrivePlanet: PlanetId;
  departMs: number;
  arriveMs: number;
  tofDays: number;
  depState: StateKm;
  arrState: StateKm;
  v1: Vec3;
  v2: Vec3;
  depVinf: number;
  depC3: number;
  arrVinf: number;
  dvDepart: number;
  dvCapture: number;
  dvTotal: number;
  /** Heliocentric transfer path, km, sampled uniformly in time. */
  trajectory: Vec3[];
  /** Planets included in the visualizations (route planets + inner context). */
  planetIds: PlanetId[];
  /** Shown planets' positions over [departMs, arriveMs], same sample count. */
  planetPaths: Partial<Record<PlanetId, Vec3[]>>;
  /** Full orbit loops (one period) for orbit rendering, km. */
  orbitLoops: Partial<Record<PlanetId, Vec3[]>>;
}

export const TRAJECTORY_SAMPLES = 160;
const ORBIT_SAMPLES = 128;

/** One full orbit of a planet, sampled around an epoch, for drawing orbit lines. */
export function orbitLoop(planet: PlanetId, epochMs: number, samples = ORBIT_SAMPLES): Vec3[] {
  const periodMs = PLANETS[planet].periodYears * 365.25 * DAY_MS;
  const pts: Vec3[] = [];
  for (let i = 0; i <= samples; i++) {
    pts.push(planetState(planet, epochMs + (periodMs * i) / samples).r);
  }
  return pts;
}

export function buildMission(
  departPlanet: PlanetId,
  arrivePlanet: PlanetId,
  departMs: number,
  arriveMs: number,
  aerocapture = false,
): Mission | null {
  const tofDays = (arriveMs - departMs) / DAY_MS;
  if (tofDays <= 1) return null;

  const depState = planetState(departPlanet, departMs);
  const arrState = planetState(arrivePlanet, arriveMs);
  const sols = solveLambert(depState.r, arrState.r, tofDays * DAY_S, MU_SUN, {
    prograde: true,
    maxRevs: 0,
  });
  if (sols.length === 0) return null;
  const { v1, v2 } = sols[0];

  const depVinf = norm(sub(v1, depState.v));
  const arrVinf = norm(sub(v2, arrState.v));
  const dvDepart = departureBurnDv(depVinf, departPlanet);
  const dvCapture = captureBurnDv(arrVinf, arrivePlanet, aerocapture);

  const trajectory = sampleConic(depState.r, v1, tofDays * DAY_S, MU_SUN, TRAJECTORY_SAMPLES);

  const maxActiveAu = Math.max(
    PLANETS[departPlanet].semiMajorAxisAu,
    PLANETS[arrivePlanet].semiMajorAxisAu,
  );
  const planetIds = PLANET_IDS.filter(
    (id) =>
      id === departPlanet ||
      id === arrivePlanet ||
      PLANETS[id].semiMajorAxisAu < maxActiveAu * 2.2,
  );

  const sampleTimes = Array.from(
    { length: TRAJECTORY_SAMPLES + 1 },
    (_, i) => departMs + ((arriveMs - departMs) * i) / TRAJECTORY_SAMPLES,
  );
  const planetPaths: Partial<Record<PlanetId, Vec3[]>> = {};
  const orbitLoops: Partial<Record<PlanetId, Vec3[]>> = {};
  for (const id of planetIds) {
    planetPaths[id] = planetStates(id, sampleTimes).map((s) => s.r);
    orbitLoops[id] = orbitLoop(id, departMs);
  }

  return {
    departPlanet,
    arrivePlanet,
    departMs,
    arriveMs,
    tofDays,
    depState,
    arrState,
    v1,
    v2,
    depVinf,
    depC3: depVinf * depVinf,
    arrVinf,
    dvDepart,
    dvCapture,
    dvTotal: dvDepart + dvCapture,
    trajectory,
    planetIds,
    planetPaths,
    orbitLoops,
  };
}
