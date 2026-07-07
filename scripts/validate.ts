// Section 4 sanity checks. Run with: npm run validate
// Gates all UI work: if these fail, the solver or ephemeris is wrong.

import { solveLambert, lambertResiduals } from '../src/lib/lambert';
import { planetState } from '../src/lib/ephemeris';
import { computePorkchopGrid, departureBurnDv, captureBurnDv } from '../src/lib/porkchop';
import { MU_SUN, DAY_S } from '../src/lib/orbitalConstants';
import { sub, norm, type Vec3 } from '../src/lib/vec';

let failures = 0;

function check(name: string, cond: boolean, detail: string) {
  const tag = cond ? 'PASS' : 'FAIL';
  if (!cond) failures++;
  console.log(`[${tag}] ${name}  —  ${detail}`);
}

const ms = (iso: string) => Date.parse(iso);
const fmt = (n: number, d = 3) => n.toFixed(d);
const dateStr = (t: number) => new Date(t).toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
console.log('\n=== 1. Lambert solver vs Vallado Example 7-5 (Earth orbit) ===');
{
  const MU_EARTH = 398_600.4418;
  const r1: Vec3 = [15945.34, 0, 0];
  const r2: Vec3 = [12214.83899, 10249.46731, 0];
  const tof = 76 * 60; // 76 minutes
  const sols = solveLambert(r1, r2, tof, MU_EARTH);
  const v1 = sols[0].v1;
  const v2 = sols[0].v2;
  // Published solution: v1 ≈ (2.058913, 2.915965, 0), v2 ≈ (-3.451565, 0.910315, 0) km/s
  const dv1 = norm(sub(v1, [2.058913, 2.915965, 0]));
  const dv2 = norm(sub(v2, [-3.451565, 0.910315, 0]));
  check('Vallado 7-5 v1', dv1 < 1e-3, `v1=(${v1.map((x) => fmt(x, 6)).join(', ')}) err=${dv1.toExponential(2)}`);
  check('Vallado 7-5 v2', dv2 < 1e-3, `v2=(${v2.map((x) => fmt(x, 6)).join(', ')}) err=${dv2.toExponential(2)}`);
}

// ---------------------------------------------------------------------------
console.log('\n=== 2. Conservation residuals on a heliocentric solution ===');
{
  const dep = planetState('Earth', ms('2026-11-15'));
  const arr = planetState('Mars', ms('2027-09-15'));
  const tof = (ms('2027-09-15') - ms('2026-11-15')) / 1000;
  const sols = solveLambert(dep.r, arr.r, tof, MU_SUN);
  const { energyRel, hRel } = lambertResiduals(dep.r, arr.r, sols[0], MU_SUN);
  check('energy conserved', energyRel < 1e-9, `relative energy mismatch ${energyRel.toExponential(2)}`);
  check('ang. momentum conserved', hRel < 1e-9, `relative h mismatch ${hRel.toExponential(2)}`);
}

// ---------------------------------------------------------------------------
console.log('\n=== 3. Ephemeris sanity: Earth and Mars heliocentric distance ===');
{
  const e = planetState('Earth', ms('2026-07-07'));
  const m = planetState('Mars', ms('2026-07-07'));
  const AU = 149_597_870.7;
  const rE = norm(e.r) / AU;
  const rM = norm(m.r) / AU;
  const vE = norm(e.v);
  check('Earth r ≈ 1 AU', rE > 0.98 && rE < 1.02, `${fmt(rE, 4)} AU`);
  check('Mars r in [1.38, 1.67] AU', rM > 1.38 && rM < 1.67, `${fmt(rM, 4)} AU`);
  check('Earth v ≈ 29.8 km/s', vE > 29.2 && vE < 30.3, `${fmt(vE, 3)} km/s`);
  check('Earth near ecliptic plane', Math.abs(e.r[2]) / norm(e.r) < 1e-4, `z/r = ${(e.r[2] / norm(e.r)).toExponential(2)}`);
}

// ---------------------------------------------------------------------------
console.log('\n=== 4. Mars 2020 (Perseverance) point check ===');
{
  // Launch 2020-07-30, landing 2021-02-18. Published departure C3 ≈ 14.5 km²/s².
  const dep = planetState('Earth', ms('2020-07-30'));
  const arr = planetState('Mars', ms('2021-02-18'));
  const tofDays = (ms('2021-02-18') - ms('2020-07-30')) / 86_400_000;
  const sols = solveLambert(dep.r, arr.r, tofDays * DAY_S, MU_SUN);
  const vinfDep = norm(sub(sols[0].v1, dep.v));
  const c3 = vinfDep * vinfDep;
  check('Perseverance C3 ≈ 14–16', c3 > 12 && c3 < 18, `C3 = ${fmt(c3, 2)} km²/s² (published ≈ 14.5), TOF = ${fmt(tofDays, 0)} d`);
}

// ---------------------------------------------------------------------------
console.log('\n=== 5. Earth→Mars 2026/27 window: full grid, Section 4 ranges ===');
let win2026DepMs = 0;
{
  const grid = computePorkchopGrid({
    departPlanet: 'Earth',
    arrivePlanet: 'Mars',
    departStartMs: ms('2026-08-01'),
    departEndMs: ms('2027-06-01'),
    arriveStartMs: ms('2027-01-01'),
    arriveEndMs: ms('2028-08-01'),
    stepDays: 2,
  });
  const m = grid.min!;
  win2026DepMs = m.departMs;
  console.log(
    `  optimum: depart ${dateStr(m.departMs)}  arrive ${dateStr(m.arriveMs)}  ` +
      `TOF ${fmt(m.tofDays, 0)} d  C3 ${fmt(m.depC3, 2)} km²/s²  ` +
      `v∞_arr ${fmt(m.arrVinf, 2)} km/s  total Δv ${fmt(m.totalDv, 2)} km/s`,
  );
  console.log(
    `  burns: departure ${fmt(departureBurnDv(m.depVinf, 'Earth'), 2)} km/s (200 km LEO), ` +
      `capture ${fmt(captureBurnDv(m.arrVinf, 'Mars'), 2)} km/s (300 km circular)`,
  );
  check('TOF in 200–350 d', m.tofDays >= 200 && m.tofDays <= 350, `${fmt(m.tofDays, 0)} days`);
  check('total Δv in 5–6.5 km/s', m.totalDv >= 5 && m.totalDv <= 6.5, `${fmt(m.totalDv, 2)} km/s`);
  check('departure C3 in 8–20 km²/s²', m.depC3 >= 8 && m.depC3 <= 20, `${fmt(m.depC3, 2)} km²/s²`);
}

// ---------------------------------------------------------------------------
console.log('\n=== 6. Synodic repeat: 2028/29 window ~780 days later ===');
{
  const grid = computePorkchopGrid({
    departPlanet: 'Earth',
    arrivePlanet: 'Mars',
    departStartMs: ms('2028-09-01'),
    departEndMs: ms('2029-07-01'),
    arriveStartMs: ms('2029-02-01'),
    arriveEndMs: ms('2030-09-01'),
    stepDays: 2,
  });
  const m = grid.min!;
  const gapDays = (m.departMs - win2026DepMs) / 86_400_000;
  console.log(
    `  optimum: depart ${dateStr(m.departMs)}  arrive ${dateStr(m.arriveMs)}  ` +
      `TOF ${fmt(m.tofDays, 0)} d  C3 ${fmt(m.depC3, 2)}  total Δv ${fmt(m.totalDv, 2)} km/s`,
  );
  check(
    'window-to-window gap ≈ 26 months',
    gapDays > 700 && gapDays < 860,
    `${fmt(gapDays, 0)} days between optimal departures (synodic ≈ 780)`,
  );
}

// ---------------------------------------------------------------------------
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
