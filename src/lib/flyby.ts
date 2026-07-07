// Patched-conic gravity-assist model.
//
// A flyby patches two Lambert legs at an intermediate planet: the incoming
// and outgoing hyperbolic excess vectors (v∞_in, v∞_out) must be connected by
// a hyperbolic passage. The turn between them is bought with periapsis depth;
// any mismatch is charged as a propulsive Δv:
//
//  · The combined turn available when patching two hyperbolas (speeds v∞_in,
//    v∞_out) at common periapsis rp is
//        δ(rp) = asin(1/e_in) + asin(1/e_out),  e = 1 + rp·v∞²/μ
//    δ decreases monotonically with rp.
//  · If the required turn is achievable at some rp ≥ rp_min, we bisect for
//    that rp and charge only the periapsis speed mismatch:
//        Δv = |√(v∞_out² + 2μ/rp) − √(v∞_in² + 2μ/rp)|
//  · If not even rp_min turns far enough, we fly at rp_min, charge the
//    periapsis mismatch there, plus the leftover turn as an impulse
//        Δv_turn = 2·min(v∞)·sin(Δδ/2)
//
// This is the standard preliminary-design approximation (cf. pykep MGA);
// good for window scouting, not for ops.

import { PLANETS, type PlanetId } from './orbitalConstants';
import { dot, norm, type Vec3 } from './vec';

export interface FlybyResult {
  /** Propulsive Δv charged at the flyby, km/s. ~0 → ballistic assist. */
  dv: number;
  /** Periapsis radius used, km. */
  rpKm: number;
  /** Periapsis altitude, km. */
  altKm: number;
  /** Required turn between v∞ vectors, deg. */
  turnReqDeg: number;
  /** Maximum turn available at rp_min, deg. */
  turnMaxDeg: number;
  vinfIn: number;
  vinfOut: number;
  /** True when the assist needs (almost) no propellant. */
  ballistic: boolean;
}

/** Minimum safe flyby periapsis, km from planet center. */
export function minFlybyRadiusKm(planet: PlanetId): number {
  const p = PLANETS[planet];
  return p.radiusKm * 1.05 + (p.hasAtmosphere ? 300 : 100);
}

/** Combined turn angle (rad) of the patched hyperbolas at periapsis rp. */
function turnAt(rp: number, vinfIn: number, vinfOut: number, mu: number): number {
  const eIn = 1 + (rp * vinfIn * vinfIn) / mu;
  const eOut = 1 + (rp * vinfOut * vinfOut) / mu;
  return Math.asin(1 / eIn) + Math.asin(1 / eOut);
}

export function evaluateFlyby(vinfInVec: Vec3, vinfOutVec: Vec3, planet: PlanetId): FlybyResult {
  const mu = PLANETS[planet].mu;
  const rpMin = minFlybyRadiusKm(planet);
  const vi = norm(vinfInVec);
  const vo = norm(vinfOutVec);
  const cosd = Math.min(1, Math.max(-1, dot(vinfInVec, vinfOutVec) / (vi * vo)));
  const turnReq = Math.acos(cosd);
  const turnMax = turnAt(rpMin, vi, vo, mu);

  const degrees = (r: number) => (r * 180) / Math.PI;
  const periMismatch = (rp: number) =>
    Math.abs(Math.sqrt(vo * vo + (2 * mu) / rp) - Math.sqrt(vi * vi + (2 * mu) / rp));

  if (turnReq <= turnMax) {
    // find rp ≥ rpMin with δ(rp) = turnReq (δ decreases with rp)
    let lo = rpMin;
    let hi = rpMin;
    while (turnAt(hi, vi, vo, mu) > turnReq && hi < 1e10) hi *= 2;
    if (hi >= 1e10) {
      // required turn ≈ 0: patch far away, only magnitude mismatch remains
      const dv = Math.abs(vo - vi);
      return {
        dv,
        rpKm: hi,
        altKm: hi - PLANETS[planet].radiusKm,
        turnReqDeg: degrees(turnReq),
        turnMaxDeg: degrees(turnMax),
        vinfIn: vi,
        vinfOut: vo,
        ballistic: dv < 1e-4,
      };
    }
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if (turnAt(mid, vi, vo, mu) > turnReq) lo = mid;
      else hi = mid;
    }
    const rp = (lo + hi) / 2;
    const dv = periMismatch(rp);
    return {
      dv,
      rpKm: rp,
      altKm: rp - PLANETS[planet].radiusKm,
      turnReqDeg: degrees(turnReq),
      turnMaxDeg: degrees(turnMax),
      vinfIn: vi,
      vinfOut: vo,
      ballistic: dv < 1e-4,
    };
  }

  // even the lowest safe pass cannot turn enough: buy the remainder
  const dv = periMismatch(rpMin) + 2 * Math.min(vi, vo) * Math.sin((turnReq - turnMax) / 2);
  return {
    dv,
    rpKm: rpMin,
    altKm: rpMin - PLANETS[planet].radiusKm,
    turnReqDeg: degrees(turnReq),
    turnMaxDeg: degrees(turnMax),
    vinfIn: vi,
    vinfOut: vo,
    ballistic: false,
  };
}
