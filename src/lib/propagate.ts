// Two-body Kepler propagation via universal variables (Stumpff functions).
// Used to sample the transfer conic between the Lambert endpoints — works for
// elliptic, parabolic and hyperbolic arcs alike.

import { dot, norm, type Vec3 } from './vec';

function stumpffC(z: number): number {
  if (z > 1e-8) return (1 - Math.cos(Math.sqrt(z))) / z;
  if (z < -1e-8) return (Math.cosh(Math.sqrt(-z)) - 1) / -z;
  return 0.5;
}

function stumpffS(z: number): number {
  if (z > 1e-8) {
    const s = Math.sqrt(z);
    return (s - Math.sin(s)) / (s * s * s);
  }
  if (z < -1e-8) {
    const s = Math.sqrt(-z);
    return (Math.sinh(s) - s) / (s * s * s);
  }
  return 1 / 6;
}

export interface State {
  r: Vec3;
  v: Vec3;
}

/** Propagate (r0, v0) by dt seconds under gravitational parameter mu. */
export function propagateKepler(r0: Vec3, v0: Vec3, dt: number, mu: number): State {
  if (dt === 0) return { r: r0, v: v0 };
  const r0n = norm(r0);
  const vr0 = dot(r0, v0) / r0n;
  const sqrtMu = Math.sqrt(mu);
  const alpha = 2 / r0n - dot(v0, v0) / mu; // 1/a

  // initial guess for universal anomaly chi
  let chi: number;
  if (alpha > 1e-12) {
    chi = sqrtMu * Math.abs(alpha) * dt;
  } else {
    // parabolic / hyperbolic
    const a = 1 / (alpha || -1e-12);
    chi =
      (Math.sign(dt) *
        Math.sqrt(-a) *
        Math.log(
          (-2 * mu * alpha * dt) /
            (dot(r0, v0) + Math.sign(dt) * Math.sqrt(-mu * a) * (1 - r0n * alpha)),
        )) ||
      (sqrtMu * dt) / r0n;
    if (!Number.isFinite(chi)) chi = (sqrtMu * dt) / r0n;
  }

  let ratio = 1;
  let iter = 0;
  let z = 0;
  let C = 0.5;
  let S = 1 / 6;
  while (Math.abs(ratio) > 1e-10 && iter < 60) {
    z = alpha * chi * chi;
    C = stumpffC(z);
    S = stumpffS(z);
    const chi2 = chi * chi;
    const F =
      ((r0n * vr0) / sqrtMu) * chi2 * C + (1 - alpha * r0n) * chi2 * chi * S + r0n * chi -
      sqrtMu * dt;
    const dF =
      ((r0n * vr0) / sqrtMu) * chi * (1 - alpha * chi2 * S) +
      (1 - alpha * r0n) * chi2 * C +
      r0n;
    ratio = F / dF;
    chi -= ratio;
    iter++;
  }

  const chi2 = chi * chi;
  z = alpha * chi2;
  C = stumpffC(z);
  S = stumpffS(z);
  const f = 1 - (chi2 / r0n) * C;
  const g = dt - (chi2 * chi * S) / sqrtMu;
  const r: Vec3 = [
    f * r0[0] + g * v0[0],
    f * r0[1] + g * v0[1],
    f * r0[2] + g * v0[2],
  ];
  const rn = norm(r);
  const fdot = ((sqrtMu / (rn * r0n)) * chi * (z * S - 1)) as number;
  const gdot = 1 - (chi2 / rn) * C;
  const v: Vec3 = [
    fdot * r0[0] + gdot * v0[0],
    fdot * r0[1] + gdot * v0[1],
    fdot * r0[2] + gdot * v0[2],
  ];
  return { r, v };
}

/** Sample the conic from (r0, v0) over tofSec into n+1 positions (inclusive). */
export function sampleConic(r0: Vec3, v0: Vec3, tofSec: number, mu: number, n = 128): Vec3[] {
  const pts: Vec3[] = [];
  for (let i = 0; i <= n; i++) {
    pts.push(propagateKepler(r0, v0, (tofSec * i) / n, mu).r);
  }
  return pts;
}
