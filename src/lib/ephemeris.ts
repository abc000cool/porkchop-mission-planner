// Real heliocentric planet states from astronomy-engine (VSOP87-derived),
// converted to the ecliptic J2000 frame in km / km/s. This is the single
// source of truth for planet positions — no circular-orbit approximations.

import {
  Body,
  HelioState,
  KM_PER_AU,
  MakeTime,
  Rotation_EQJ_ECL,
  RotateState,
} from 'astronomy-engine';
import type { PlanetId } from './orbitalConstants';
import type { Vec3 } from './vec';

export interface StateKm {
  /** Heliocentric position, ecliptic J2000, km. */
  r: Vec3;
  /** Heliocentric velocity, ecliptic J2000, km/s. */
  v: Vec3;
}

const EQJ_TO_ECL = Rotation_EQJ_ECL();
const KM_PER_AU_PER_DAY = KM_PER_AU / 86_400;

const BODY_MAP: Record<PlanetId, Body> = {
  Mercury: Body.Mercury,
  Venus: Body.Venus,
  Earth: Body.Earth,
  Mars: Body.Mars,
  Jupiter: Body.Jupiter,
  Saturn: Body.Saturn,
  Uranus: Body.Uranus,
  Neptune: Body.Neptune,
};

/** Heliocentric state of a planet at a UTC timestamp (ms since epoch). */
export function planetState(planet: PlanetId, utcMs: number): StateKm {
  const time = MakeTime(new Date(utcMs));
  const eqj = HelioState(BODY_MAP[planet], time);
  const ecl = RotateState(EQJ_TO_ECL, eqj);
  return {
    r: [ecl.x * KM_PER_AU, ecl.y * KM_PER_AU, ecl.z * KM_PER_AU],
    v: [ecl.vx * KM_PER_AU_PER_DAY, ecl.vy * KM_PER_AU_PER_DAY, ecl.vz * KM_PER_AU_PER_DAY],
  };
}

/** Precompute states for a planet over a list of timestamps. */
export function planetStates(planet: PlanetId, utcMsList: readonly number[]): StateKm[] {
  return utcMsList.map((ms) => planetState(planet, ms));
}
