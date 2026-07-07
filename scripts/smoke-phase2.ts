// Headless smoke test for Phase 2 logic: mission building, trajectory
// propagation accuracy, and top-window extraction.

import { buildMission } from '../src/lib/mission';
import { computePorkchopGrid, findTopWindows } from '../src/lib/porkchop';
import { norm, sub } from '../src/lib/vec';

const ms = (iso: string) => Date.parse(iso);
let failures = 0;
const check = (name: string, cond: boolean, detail: string) => {
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name} — ${detail}`);
  if (!cond) failures++;
};

// Mission for the validated 2026 optimum
const t0 = Date.now();
const mission = buildMission('Earth', 'Mars', ms('2026-11-01'), ms('2027-09-08'))!;
const buildTime = Date.now() - t0;

check('mission built', !!mission, `${buildTime} ms`);
check('build fast enough', buildTime < 900, `${buildTime} ms (main-thread click budget)`);
check(
  'dv matches grid optimum',
  Math.abs(mission.dvTotal - 5.69) < 0.05,
  `dvTotal=${mission.dvTotal.toFixed(3)} km/s`,
);

// Trajectory endpoint must land on Mars (propagation closes the loop)
const endErr = norm(sub(mission.trajectory[mission.trajectory.length - 1], mission.arrState.r));
check('trajectory closes at Mars', endErr < 5000, `endpoint error ${endErr.toFixed(1)} km`);
const startErr = norm(sub(mission.trajectory[0], mission.depState.r));
check('trajectory starts at Earth', startErr < 1, `error ${startErr.toExponential(2)} km`);

// planet paths present for shown planets, all same length
check(
  'planet paths sampled',
  mission.planetIds.every((id) => mission.planetPaths[id]!.length === mission.trajectory.length),
  `planets: ${mission.planetIds.join(', ')}`,
);

// Top windows on a two-synodic grid should include both the 2026 and 2028 windows
const grid = computePorkchopGrid({
  departPlanet: 'Earth',
  arrivePlanet: 'Mars',
  departStartMs: ms('2026-07-07'),
  departEndMs: ms('2029-06-01'),
  arriveStartMs: ms('2026-10-06'),
  arriveEndMs: ms('2030-12-01'),
  stepDays: 4,
});
const wins = findTopWindows(grid, 5);
console.log(
  wins
    .map(
      (w, i) =>
        `  #${i + 1} depart ${new Date(w.departMs).toISOString().slice(0, 10)} arrive ${new Date(w.arriveMs).toISOString().slice(0, 10)} dv=${w.totalDv.toFixed(2)} tof=${Math.round(w.tofDays)}`,
    )
    .join('\n'),
);
check('found ≥3 windows', wins.length >= 3, `${wins.length} windows`);
const has2026 = wins.some((w) => Math.abs(w.departMs - ms('2026-11-01')) < 40 * 86400e3);
const has2028 = wins.some((w) => Math.abs(w.departMs - ms('2028-11-22')) < 60 * 86400e3);
check('2026 window present', has2026, 'near 2026-11-01');
check('2028 window present', has2028, 'near 2028-11-22');
check('sorted by dv', wins.every((w, i) => i === 0 || w.totalDv >= wins[i - 1].totalDv), '');

console.log(failures === 0 ? '\nSMOKE OK' : `\n${failures} FAILURES`);
process.exit(failures ? 1 : 0);
