// Izzo's algorithm for Lambert's problem.
// D. Izzo, "Revisiting Lambert's Problem", Celestial Mechanics and Dynamical
// Astronomy 121 (2015). Structure follows the reference implementation in
// ESA's pykep (lambert_problem.cpp): universal variable x, Householder
// root-finding on the non-dimensional time-of-flight curve, Battin series /
// Lagrange / Lancaster-Blanchard expressions selected by distance from x = 1.
//
// Units: km, km/s, s. Works for any central body via mu.

import { cross, dot, neg, norm, normalize, scale, sub, type Vec3 } from './vec';

export interface LambertSolution {
  /** Velocity at r1, km/s. */
  v1: Vec3;
  /** Velocity at r2, km/s. */
  v2: Vec3;
  /** Number of complete revolutions. */
  revs: number;
  /** For revs > 0 there are two solutions per revolution count. */
  branch: 'single' | 'low' | 'high';
  /** Universal variable at convergence (diagnostic). */
  x: number;
  iterations: number;
}

export interface LambertOptions {
  /** Prograde (counter-clockwise seen from +Z ecliptic) when true. Default true. */
  prograde?: boolean;
  /** Maximum revolutions to solve for. Default 0 (direct transfer only). */
  maxRevs?: number;
}

const HYPERGEOMETRIC_TOL = 1e-11;

/** Gauss hypergeometric 2F1(3, 1; 5/2; z) by series, |z| < 1. */
function hypergeometricF(z: number): number {
  let Sj = 1.0;
  let Cj = 1.0;
  let err = 1.0;
  let j = 0;
  while (err > HYPERGEOMETRIC_TOL && j < 200) {
    const Cj1 = (Cj * ((3.0 + j) * (1.0 + j))) / (2.5 + j) * (z / (j + 1));
    Sj += Cj1;
    err = Math.abs(Cj1);
    Cj = Cj1;
    j++;
  }
  return Sj;
}

/** Non-dimensional TOF for a given x and revolution count N. */
function x2tof(lambda: number, x: number, N: number): number {
  const battin = 0.01;
  const lagrange = 0.2;
  const dist = Math.abs(x - 1);
  const lambda2 = lambda * lambda;

  if (dist < lagrange && dist > battin) {
    // Lagrange form (via semi-major axis)
    const a = 1.0 / (1.0 - x * x);
    if (a > 0) {
      // ellipse
      let alfa = 2.0 * Math.acos(x);
      let beta = 2.0 * Math.asin(Math.sqrt(lambda2 / a));
      if (lambda < 0.0) beta = -beta;
      return (
        (a * Math.sqrt(a) * (alfa - Math.sin(alfa) - (beta - Math.sin(beta)) + 2.0 * Math.PI * N)) /
        2.0
      );
    }
    // hyperbola
    let alfa = 2.0 * Math.acosh(x);
    let beta = 2.0 * Math.asinh(Math.sqrt(-lambda2 / a));
    if (lambda < 0.0) beta = -beta;
    return (-a * Math.sqrt(-a) * (beta - Math.sinh(beta) - (alfa - Math.sinh(alfa)))) / 2.0;
  }

  const E = x * x - 1.0;
  const rho = Math.abs(E);
  const z = Math.sqrt(1 + lambda2 * E);

  if (dist < battin) {
    // Battin series expansion around x = 1 (parabolic)
    const eta = z - lambda * x;
    const S1 = 0.5 * (1.0 - lambda - x * eta);
    let Q = hypergeometricF(S1);
    Q = (4.0 / 3.0) * Q;
    return (eta * eta * eta * Q + 4.0 * lambda * eta) / 2.0 + (N * Math.PI) / Math.pow(rho, 1.5);
  }

  // Lancaster-Blanchard form
  const y = Math.sqrt(rho);
  const g = x * z - lambda * E;
  let d: number;
  if (E < 0) {
    const l = Math.acos(g);
    d = N * Math.PI + l;
  } else {
    const f = y * (z - lambda * x);
    d = Math.log(f + g);
  }
  return (x - lambda * z - d / y) / E;
}

/** First three derivatives of non-dimensional TOF with respect to x. */
function dTdx(lambda: number, x: number, T: number): [number, number, number] {
  const l2 = lambda * lambda;
  const l3 = l2 * lambda;
  const umx2 = 1.0 - x * x;
  const y = Math.sqrt(1.0 - l2 * umx2);
  const y2 = y * y;
  const y3 = y2 * y;
  const DT = (1.0 / umx2) * (3.0 * T * x - 2.0 + (2.0 * l3 * x) / y);
  const DDT = (1.0 / umx2) * (3.0 * T + 5.0 * x * DT + (2.0 * (1.0 - l2) * l3) / y3);
  const DDDT =
    (1.0 / umx2) * (7.0 * x * DDT + 8.0 * DT - (6.0 * (1.0 - l2) * l2 * l3 * x) / (y3 * y2));
  return [DT, DDT, DDDT];
}

/** Householder (3rd order) iterations for x given target non-dimensional TOF. */
function householder(
  lambda: number,
  T: number,
  x0: number,
  N: number,
  eps: number,
  iterMax: number,
): [number, number] {
  let it = 0;
  let err = 1.0;
  let x = x0;
  while (err > eps && it < iterMax) {
    const tof = x2tof(lambda, x, N);
    const [DT, DDT, DDDT] = dTdx(lambda, x, tof);
    const delta = tof - T;
    const DT2 = DT * DT;
    const xnew =
      x -
      (delta * (DT2 - (delta * DDT) / 2.0)) /
        (DT * (DT2 - delta * DDT) + (DDDT * delta * delta) / 6.0);
    err = Math.abs(x - xnew);
    x = xnew;
    it++;
  }
  return [x, it];
}

/**
 * Solve Lambert's problem: find the conic arc(s) connecting r1 to r2 in
 * exactly tofSec seconds around a body with gravitational parameter mu.
 *
 * Returns [] when no solution exists (non-positive TOF, collinear geometry).
 * Index 0 is always the zero-revolution solution; for each N <= maxRevs with
 * solutions, the low-energy ("left") and high-energy ("right") branches follow.
 */
export function solveLambert(
  r1: Vec3,
  r2: Vec3,
  tofSec: number,
  mu: number,
  opts: LambertOptions = {},
): LambertSolution[] {
  const prograde = opts.prograde ?? true;
  const maxRevs = opts.maxRevs ?? 0;

  if (!(tofSec > 0) || !(mu > 0)) return [];

  const r1n = norm(r1);
  const r2n = norm(r2);
  if (!(r1n > 0) || !(r2n > 0)) return [];

  const cVec = sub(r2, r1);
  const c = norm(cVec);
  const s = (c + r1n + r2n) / 2.0;

  const T = Math.sqrt((2.0 * mu) / (s * s * s)) * tofSec;

  const ir1 = scale(r1, 1 / r1n);
  const ir2 = scale(r2, 1 / r2n);
  const ihRaw = cross(ir1, ir2);
  const ihn = norm(ihRaw);
  if (ihn < 1e-12) return []; // transfer angle 0 or 180 deg: plane undefined
  const ih = scale(ihRaw, 1 / ihn);

  const lambda2 = Math.max(0, 1.0 - c / s);
  let lambda = Math.sqrt(lambda2);
  let it1: Vec3;
  let it2: Vec3;
  if (ih[2] < 0.0) {
    // transfer angle > 180 deg as seen from +Z
    lambda = -lambda;
    it1 = cross(ir1, ih);
    it2 = cross(ir2, ih);
  } else {
    it1 = cross(ih, ir1);
    it2 = cross(ih, ir2);
  }
  it1 = normalize(it1);
  it2 = normalize(it2);
  if (!prograde) {
    lambda = -lambda;
    it1 = neg(it1);
    it2 = neg(it2);
  }

  const lambda3 = lambda2 * lambda;
  const lambda5 = lambda2 * lambda3;

  // Maximum revolution count with a solution at this T
  let Nmax = Math.floor(T / Math.PI);
  const T00 = Math.acos(lambda) + lambda * Math.sqrt(1.0 - lambda2);
  const T0 = T00 + Nmax * Math.PI;
  const T1 = (2.0 / 3.0) * (1.0 - lambda3);

  if (Nmax > 0 && T < T0) {
    // Halley iterations for the minimum of the T(x) curve at Nmax
    let it = 0;
    let Tmin = T0;
    let xOld = 0.0;
    let xNew = 0.0;
    for (;;) {
      const [DT, DDT, DDDT] = dTdx(lambda, xOld, Tmin);
      if (DT !== 0.0) {
        xNew = xOld - (DT * DDT) / (DDT * DDT - (DT * DDDT) / 2.0);
      }
      if (Math.abs(xOld - xNew) < 1e-13 || it > 12) break;
      Tmin = x2tof(lambda, xNew, Nmax);
      xOld = xNew;
      it++;
    }
    if (Tmin > T) Nmax -= 1;
  }
  Nmax = Math.min(maxRevs, Math.max(0, Nmax));

  // Solve for x: zero-rev solution first
  const xs: { x: number; revs: number; branch: LambertSolution['branch']; iters: number }[] = [];
  let x0: number;
  if (T >= T00) {
    x0 = -(T - T00) / (T - T00 + 4);
  } else if (T <= T1) {
    x0 = (T1 * (T1 - T)) / ((2.0 / 5.0) * (1 - lambda5) * T) + 1;
  } else {
    x0 = Math.pow(T / T00, 0.6931471805599453 / Math.log(T1 / T00)) - 1;
  }
  {
    const [x, iters] = householder(lambda, T, x0, 0, 1e-8, 20);
    xs.push({ x, revs: 0, branch: 'single', iters });
  }

  for (let i = 1; i <= Nmax; i++) {
    // left (low-energy) branch
    let tmp = Math.pow((i * Math.PI + Math.PI) / (8.0 * T), 2.0 / 3.0);
    const [xl, itl] = householder(lambda, T, (tmp - 1) / (tmp + 1), i, 1e-8, 20);
    xs.push({ x: xl, revs: i, branch: 'low', iters: itl });
    // right (high-energy) branch
    tmp = Math.pow((8.0 * T) / (i * Math.PI), 2.0 / 3.0);
    const [xr, itr] = householder(lambda, T, (tmp - 1) / (tmp + 1), i, 1e-8, 20);
    xs.push({ x: xr, revs: i, branch: 'high', iters: itr });
  }

  // Reconstruct velocity vectors
  const gamma = Math.sqrt((mu * s) / 2.0);
  const rho = (r1n - r2n) / c;
  const sigma = Math.sqrt(1 - rho * rho);

  return xs.map(({ x, revs, branch, iters }) => {
    const y = Math.sqrt(1.0 - lambda2 + lambda2 * x * x);
    const vr1 = (gamma * (lambda * y - x - rho * (lambda * y + x))) / r1n;
    const vr2 = (-gamma * (lambda * y - x + rho * (lambda * y + x))) / r2n;
    const vt = gamma * sigma * (y + lambda * x);
    const vt1 = vt / r1n;
    const vt2 = vt / r2n;
    const v1: Vec3 = [
      vr1 * ir1[0] + vt1 * it1[0],
      vr1 * ir1[1] + vt1 * it1[1],
      vr1 * ir1[2] + vt1 * it1[2],
    ];
    const v2: Vec3 = [
      vr2 * ir2[0] + vt2 * it2[0],
      vr2 * ir2[1] + vt2 * it2[1],
      vr2 * ir2[2] + vt2 * it2[2],
    ];
    return { v1, v2, revs, branch, x, iterations: iters };
  });
}

/**
 * Specific orbital energy and angular momentum consistency check for a
 * solution — used by the validation suite, cheap enough to keep here.
 */
export function lambertResiduals(
  r1: Vec3,
  r2: Vec3,
  sol: LambertSolution,
  mu: number,
): { energyRel: number; hRel: number } {
  const e1 = dot(sol.v1, sol.v1) / 2 - mu / norm(r1);
  const e2 = dot(sol.v2, sol.v2) / 2 - mu / norm(r2);
  const h1 = cross(r1, sol.v1);
  const h2 = cross(r2, sol.v2);
  const energyRel = Math.abs(e1 - e2) / Math.max(Math.abs(e1), Math.abs(e2), 1e-12);
  const hRel = norm(sub(h1, h2)) / Math.max(norm(h1), 1e-12);
  return { energyRel, hRel };
}
