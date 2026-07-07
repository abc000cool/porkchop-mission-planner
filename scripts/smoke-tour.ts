// Grand Tour validation. The killer check: Voyager 2's actual route and
// encounter dates must evaluate as a near-ballistic tour with the correct
// launch C3 (~102 km²/s²).

import { evaluateFlyby } from '../src/lib/flyby';
import { buildTourMission, evaluateTour } from '../src/lib/tour';
import { optimizeTour } from '../src/lib/tourOptimizer';
import { norm, sub } from '../src/lib/vec';
import { planetState } from '../src/lib/ephemeris';

const ms = (iso: string) => Date.parse(iso);
let failures = 0;
const check = (name: string, cond: boolean, detail: string) => {
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name} — ${detail}`);
  if (!cond) failures++;
};

console.log('=== flyby unit checks ===');
{
  // pure rotation, same magnitude, modest angle → ballistic
  const fb = evaluateFlyby([5, 0, 0], [5 * Math.cos(0.5), 5 * Math.sin(0.5), 0], 'Jupiter');
  check('symmetric turn is ballistic', fb.ballistic && fb.dv < 1e-4, `dv=${fb.dv.toExponential(2)}, rp=${(fb.rpKm / 71492).toFixed(1)} RJ`);

  // magnitude change costs propellant
  const fb2 = evaluateFlyby([5, 0, 0], [6, 0, 0], 'Jupiter');
  check('magnitude mismatch costs dv', fb2.dv > 0.1, `dv=${fb2.dv.toFixed(3)} km/s`);

  // extreme turn at Mars (weak field) is expensive
  const fb3 = evaluateFlyby([8, 0, 0], [-8, 0, 0], 'Mars');
  check('180° turn at Mars infeasible ballistically', !fb3.ballistic && fb3.dv > 5, `dv=${fb3.dv.toFixed(2)} km/s, max turn ${fb3.turnMaxDeg.toFixed(1)}°`);
}

console.log('\n=== Voyager 2 Grand Tour (real dates) ===');
{
  // Launch 1977-08-20; Jupiter 1979-07-09; Saturn 1981-08-26; Uranus 1986-01-24; Neptune 1989-08-25
  const dep = ms('1977-08-20');
  const encounters = ['1979-07-09', '1981-08-26', '1986-01-24', '1989-08-25'].map(ms);
  const tofs: number[] = [];
  let prev = dep;
  for (const t of encounters) {
    tofs.push(Math.round((t - prev) / 86_400_000));
    prev = t;
  }
  console.log(`  leg TOFs: ${tofs.join(', ')} days`);

  const ev = evaluateTour(['Earth', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'], dep, tofs, {
    finish: 'flyby',
  })!;
  check('tour evaluates', !!ev && ev.feasible, '');
  console.log(
    `  launch C3 ${ev.depC3.toFixed(1)} km²/s² · flyby penalties: ${ev.flybys
      .map((f) => `${f.planet} ${f.dv.toFixed(2)} (rp ${(f.rpKm / 1000).toFixed(0)}k km, turn ${f.turnReqDeg.toFixed(0)}°/${f.turnMaxDeg.toFixed(0)}°)`)
      .join(' · ')}`,
  );
  check('launch C3 ≈ 102 km²/s²', ev.depC3 > 85 && ev.depC3 < 120, `${ev.depC3.toFixed(1)}`);
  check(
    'near-ballistic flybys',
    ev.flybys.every((f) => f.dv < 1.5),
    ev.flybys.map((f) => `${f.planet}=${f.dv.toFixed(2)}`).join(', '),
  );
  check(
    'flyby radii above min altitude',
    ev.flybys.every((f) => f.altKm > 0),
    ev.flybys.map((f) => `${(f.altKm / 1000).toFixed(0)}k km`).join(', '),
  );

  // optimizer should tighten the same route from a perturbed start
  const perturbed = tofs.map((t) => Math.round(t * 1.12));
  const before = evaluateTour(
    ['Earth', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'],
    dep + 40 * 86_400_000,
    perturbed,
    { finish: 'flyby' },
  )!;
  const t0 = Date.now();
  const opt = optimizeTour({
    route: ['Earth', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'],
    departMs: dep + 40 * 86_400_000,
    legTofDays: perturbed,
    departSlackDays: 120,
    finish: 'flyby',
  })!;
  console.log(
    `  optimizer: ${before.dvTotal.toFixed(2)} → ${opt.evaluation.dvTotal.toFixed(2)} km/s in ${opt.evals} evals (${((Date.now() - t0) / 1000).toFixed(1)} s)`,
  );
  check('optimizer improves', opt.evaluation.dvTotal < before.dvTotal - 0.1, '');
  check('optimizer result sane', opt.evaluation.dvTotal < before.dvTotal && opt.evaluation.feasible, `dv=${opt.evaluation.dvTotal.toFixed(2)}`);

  // tour mission assembly: craft must meet each planet at its flyby epoch
  const mission = buildTourMission(ev);
  let maxMissKm = 0;
  for (const fb of mission.flybys!) {
    const frac = (fb.ms - mission.departMs) / (mission.arriveMs - mission.departMs);
    const idx = Math.round(frac * (mission.trajectory.length - 1));
    const planetR = planetState(fb.planet, fb.ms).r;
    maxMissKm = Math.max(maxMissKm, norm(sub(mission.trajectory[idx], planetR)));
  }
  check('craft meets planets at flybys', maxMissKm < 3e6, `max miss ${(maxMissKm / 1e6).toFixed(2)} Mkm (visual sync)`);
  check('trajectory sampled', mission.trajectory.length > 500, `${mission.trajectory.length} points`);
}

console.log(failures === 0 ? '\nTOUR SMOKE OK' : `\n${failures} FAILURES`);
process.exit(failures ? 1 : 0);
