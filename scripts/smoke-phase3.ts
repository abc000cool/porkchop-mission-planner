// Headless checks for Phase 3: rocket curves, difficulty score, permalink
// round-trip, and trade-table physics.

import { missionDifficulty } from '../src/lib/difficulty';
import { arrivalTradeTable, buildMission } from '../src/lib/mission';
import { decodeShareState, encodeShareState } from '../src/lib/permalink';
import { computePorkchopGrid } from '../src/lib/porkchop';
import { maxC3ForPayload, payloadForC3, ROCKET_BY_ID } from '../src/lib/rocketData';

const ms = (iso: string) => Date.parse(iso);
let failures = 0;
const check = (name: string, cond: boolean, detail: string) => {
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name} — ${detail}`);
  if (!cond) failures++;
};

// rocket interpolation
const fh = ROCKET_BY_ID.falconHeavy;
const p41 = payloadForC3(fh, 41)!;
check('FH @ C3=41 ≈ Europa Clipper class', p41 > 5000 && p41 < 7000, `${p41.toFixed(0)} kg`);
check('FH beyond max C3 → null', payloadForC3(fh, 95) === null, 'C3=95');
const c3For6t = maxC3ForPayload(fh, 6000)!;
check('inverse consistent', Math.abs(payloadForC3(fh, c3For6t)! - 6000) < 1, `maxC3(6t)=${c3For6t.toFixed(1)}`);
check('payload monotonic', fh.curve.every((p, i) => i === 0 || p[1] < fh.curve[i - 1][1]), '');

// difficulty on the 2026 Mars grid
const grid = computePorkchopGrid({
  departPlanet: 'Earth',
  arrivePlanet: 'Mars',
  departStartMs: ms('2026-08-01'),
  departEndMs: ms('2027-06-01'),
  arriveStartMs: ms('2027-01-01'),
  arriveEndMs: ms('2028-08-01'),
  stepDays: 2,
});
const diff = missionDifficulty(grid, grid.min!);
console.log(`  Mars difficulty: ${diff.score} (${diff.label}), window ~${diff.windowDays}d`);
check('Mars difficulty sane', diff.score > 5 && diff.score < 50, `${diff.score}`);
check('Mars window width plausible', diff.windowDays > 14 && diff.windowDays < 200, `${diff.windowDays} d`);

// aerocapture zeroes the capture burn
const gridAero = computePorkchopGrid({ ...grid.params, aerocapture: true });
const drop = grid.min!.totalDv - gridAero.min!.totalDv;
console.log(`  aerocapture saves ${drop.toFixed(2)} km/s at optimum`);
check('aerocapture saves ~capture burn', drop > 1.5 && drop < 3, `${drop.toFixed(2)} km/s`);

// trade table
const mission = buildMission('Earth', 'Mars', ms('2026-11-01'), ms('2027-09-08'))!;
const trade = arrivalTradeTable(mission);
check('trade table rows', trade.length === 5, `${trade.length}`);
const center = trade.find((t) => t.offsetDays === 0)!;
check('trade center matches mission', Math.abs(center.dvTotal - mission.dvTotal) < 1e-6, '');

// permalink round-trip
const qs = encodeShareState({
  departPlanet: 'Earth',
  arrivePlanet: 'Jupiter',
  departRange: [ms('2026-07-07'), ms('2027-08-10')],
  arriveRange: [ms('2027-06-21'), ms('2033-08-13')],
  arrivalAuto: false,
  metric: 'c3',
  palette: 'viridis',
  aerocapture: true,
  rocketId: 'sls1',
  lockedDepartMs: ms('2026-11-08'),
  lockedArriveMs: ms('2030-09-13'),
});
const dec = decodeShareState('?' + qs)!;
check(
  'permalink round-trip',
  dec.departPlanet === 'Earth' &&
    dec.arrivePlanet === 'Jupiter' &&
    dec.departRange![0] === ms('2026-07-07') &&
    dec.arriveRange![1] === ms('2033-08-13') &&
    dec.arrivalAuto === false &&
    dec.metric === 'c3' &&
    dec.palette === 'viridis' &&
    dec.aerocapture === true &&
    dec.rocketId === 'sls1' &&
    dec.lockedDepartMs === ms('2026-11-08') &&
    dec.lockedArriveMs === ms('2030-09-13'),
  qs,
);

console.log(failures === 0 ? '\nSMOKE OK' : `\n${failures} FAILURES`);
process.exit(failures ? 1 : 0);
