import { useMemo, useState } from 'react';
import { Wand2 } from 'lucide-react';
import { DAY_MS } from '../lib/orbitalConstants';
import type { PorkchopGrid } from '../lib/porkchop';
import { payloadForC3, ROCKETS } from '../lib/rocketData';
import { fmtDate, fmtInt, fmtNum, isoDate } from '../lib/format';

interface Props {
  grid: PorkchopGrid | null;
  onLock: (departMs: number, arriveMs: number) => void;
}

interface Candidate {
  rocketId: string;
  short: string;
  color: string;
  departMs: number;
  arriveMs: number;
  totalDv: number;
  c3: number;
  marginPct: number;
}

/**
 * "Design your own mission": given a payload mass and optional target arrival
 * date, back-solve the cheapest feasible launch per vehicle from the grid.
 */
export default function MissionDesigner({ grid, onLock }: Props) {
  const [massKg, setMassKg] = useState(1000);
  const [target, setTarget] = useState('');
  const [tolDays, setTolDays] = useState(45);

  const results = useMemo(() => {
    if (!grid) return [];
    const targetMs = target ? Date.parse(target) : null;
    const nDep = grid.departDatesMs.length;
    const out: Candidate[] = [];
    for (const rocket of ROCKETS) {
      let best: Candidate | null = null;
      for (let iArr = 0; iArr < grid.arriveDatesMs.length; iArr++) {
        const arrMs = grid.arriveDatesMs[iArr];
        if (targetMs !== null && Math.abs(arrMs - targetMs) > tolDays * DAY_MS) continue;
        for (let iDep = 0; iDep < nDep; iDep++) {
          const idx = iArr * nDep + iDep;
          const dv = grid.totalDv[idx];
          if (!Number.isFinite(dv)) continue;
          if (best && dv >= best.totalDv) continue;
          const cap = payloadForC3(rocket, grid.depC3[idx]);
          if (cap === null || cap < massKg) continue;
          best = {
            rocketId: rocket.id,
            short: rocket.short,
            color: rocket.color,
            departMs: grid.departDatesMs[iDep],
            arriveMs: arrMs,
            totalDv: dv,
            c3: grid.depC3[idx],
            marginPct: ((cap - massKg) / massKg) * 100,
          };
        }
      }
      if (best) out.push(best);
    }
    return out.sort((a, b) => a.totalDv - b.totalDv);
  }, [grid, massKg, target, tolDays]);

  return (
    <section className="rounded-md border border-grid-line bg-panel px-3 py-2.5">
      <div className="flex items-center gap-2 text-[11px] tracking-[0.14em] text-text-mid uppercase">
        <Wand2 size={12} className="text-accent" /> Mission designer
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10px] tracking-widest text-text-lo uppercase">payload kg</span>
          <input
            type="number"
            min={1}
            step={100}
            value={massKg}
            onChange={(e) => setMassKg(Math.max(1, Number(e.target.value) || 1))}
            className="mt-0.5 w-full rounded border border-grid-line bg-panel-2 px-1.5 py-1 font-mono text-[11px] text-text-hi outline-none focus:border-accent"
          />
        </label>
        <label className="block">
          <span className="text-[10px] tracking-widest text-text-lo uppercase">
            arrive by (±{tolDays}d)
          </span>
          <input
            type="date"
            value={target}
            min={grid ? isoDate(grid.arriveDatesMs[0]) : undefined}
            max={grid ? isoDate(grid.arriveDatesMs[grid.arriveDatesMs.length - 1]) : undefined}
            onChange={(e) => setTarget(e.target.value)}
            className="mt-0.5 w-full rounded border border-grid-line bg-panel-2 px-1.5 py-1 font-mono text-[11px] text-text-hi [color-scheme:dark] outline-none focus:border-accent"
          />
        </label>
      </div>
      <div className="mt-1.5 flex gap-1">
        {[30, 45, 90].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTolDays(t)}
            className={`rounded-full border px-2 py-0.5 font-mono text-[9.5px] transition-colors ${
              tolDays === t
                ? 'border-accent/60 bg-accent/10 text-accent'
                : 'border-grid-line text-text-lo hover:text-text-mid'
            }`}
          >
            ±{t}d
          </button>
        ))}
        {target && (
          <button
            type="button"
            onClick={() => setTarget('')}
            className="ml-auto rounded-full border border-grid-line px-2 py-0.5 font-mono text-[9.5px] text-text-lo hover:text-danger"
          >
            any date
          </button>
        )}
      </div>

      <div className="mt-2 space-y-1">
        {results.length === 0 && (
          <div className="py-2 text-center font-mono text-[10.5px] text-text-lo">
            no vehicle can deliver {fmtInt(massKg)} kg
            {target ? ' by that date' : ' in this window range'}
          </div>
        )}
        {results.map((r) => (
          <button
            key={r.rocketId}
            type="button"
            onClick={() => onLock(r.departMs, r.arriveMs)}
            className="flex w-full items-center gap-2 rounded border border-grid-line/70 bg-panel-2/50 px-2 py-1.5 text-left font-mono text-[10.5px] transition-colors hover:border-accent-dim hover:bg-accent/5"
            title={`arrive ${fmtDate(r.arriveMs)} · C3 ${fmtNum(r.c3, 1)} km²/s² — click to lock`}
          >
            <span className="w-8 font-medium" style={{ color: r.color }}>
              {r.short}
            </span>
            <span className="text-text-hi">{fmtDate(r.departMs)}</span>
            <span className="ml-auto text-text-mid">{fmtNum(r.totalDv)} km/s</span>
            <span className={r.marginPct < 25 ? 'text-amber' : 'text-ok'}>
              +{Math.round(r.marginPct)}%
            </span>
          </button>
        ))}
      </div>
      {results.length > 0 && (
        <div className="mt-1 text-[10px] text-text-lo">
          cheapest feasible launch per vehicle · margin = spare capacity · click to lock
        </div>
      )}
    </section>
  );
}
