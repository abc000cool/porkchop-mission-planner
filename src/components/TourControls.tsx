import { Plus, Route, Sparkles, Trash2 } from 'lucide-react';
import PlanetSelect from './PlanetSelect';
import { hohmannTofDays } from '../lib/defaults';
import { fmtDate, isoDate } from '../lib/format';
import { DAY_MS, PLANETS, PLANET_IDS, type PlanetId } from '../lib/orbitalConstants';
import { TOUR_PRESETS, type TourFinish } from '../lib/tour';

interface Props {
  route: PlanetId[];
  departMs: number;
  legTofDays: number[];
  slackDays: number;
  finish: TourFinish;
  optimizing: boolean;
  optEvals: number;
  optBestDv: number | null;
  onRoute: (route: PlanetId[], legTofDays: number[]) => void;
  onDepartMs: (ms: number) => void;
  onLegTofDays: (tofs: number[]) => void;
  onSlackDays: (d: number) => void;
  onFinish: (f: TourFinish) => void;
  onOptimize: () => void;
  onCancelOptimize: () => void;
  onPreset: (id: string) => void;
}

/** Default TOF guess for a new leg: 1.1× Hohmann. */
export const defaultLegTof = (from: PlanetId, to: PlanetId) =>
  Math.round(hohmannTofDays(from, to) * 1.1);

export default function TourControls({
  route,
  departMs,
  legTofDays,
  slackDays,
  finish,
  optimizing,
  optEvals,
  optBestDv,
  onRoute,
  onDepartMs,
  onLegTofDays,
  onSlackDays,
  onFinish,
  onOptimize,
  onCancelOptimize,
  onPreset,
}: Props) {
  const target = route[route.length - 1];
  const finishOptions: { key: TourFinish; label: string; disabled?: boolean }[] = [
    { key: 'capture', label: 'capture' },
    { key: 'aerocapture', label: 'aero', disabled: !PLANETS[target].hasAtmosphere },
    { key: 'flyby', label: 'flyby' },
  ];
  const setStop = (i: number, p: PlanetId) => {
    const next = route.slice();
    next[i] = p;
    const tofs = legTofDays.slice();
    if (i > 0) tofs[i - 1] = defaultLegTof(next[i - 1], next[i]);
    if (i < next.length - 1) tofs[i] = defaultLegTof(next[i], next[i + 1]);
    onRoute(next, tofs);
  };

  const removeStop = (i: number) => {
    if (route.length <= 2) return;
    const next = route.filter((_, j) => j !== i);
    const tofs: number[] = [];
    for (let k = 0; k < next.length - 1; k++) tofs.push(defaultLegTof(next[k], next[k + 1]));
    onRoute(next, tofs);
  };

  const addFlyby = () => {
    if (route.length >= 6) return;
    const insertAt = route.length - 1;
    const used = new Set(route);
    const candidate =
      PLANET_IDS.find((p) => !used.has(p)) ?? ('Venus' as PlanetId);
    const next = [...route.slice(0, insertAt), candidate, route[insertAt]];
    const tofs: number[] = [];
    for (let k = 0; k < next.length - 1; k++) tofs.push(defaultLegTof(next[k], next[k + 1]));
    onRoute(next, tofs);
  };

  let legStart = departMs;

  return (
    <div className="flex h-full flex-col gap-4">
      {/* presets */}
      <section>
        <div className="mb-1.5 flex items-center gap-2 text-[11px] tracking-[0.14em] text-text-mid uppercase">
          <Route size={12} className="text-accent" /> Route presets
        </div>
        <div className="flex flex-wrap gap-1">
          {TOUR_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              title={p.note}
              onClick={() => onPreset(p.id)}
              className="rounded-full border border-grid-line px-2.5 py-0.5 font-mono text-[10px] tracking-wider text-text-mid transition-colors hover:border-accent/60 hover:text-accent"
            >
              {p.name}
            </button>
          ))}
        </div>
      </section>

      {/* route builder */}
      <section>
        <div className="mb-1.5 text-[11px] tracking-[0.14em] text-text-mid uppercase">Route</div>
        <div className="flex flex-col gap-1.5">
          {route.map((p, i) => (
            <div key={`${p}-${i}`} className="flex items-center gap-1.5">
              <span className="w-14 shrink-0 font-mono text-[9.5px] tracking-wider text-text-lo uppercase">
                {i === 0 ? 'launch' : i === route.length - 1 ? 'target' : `flyby ${i}`}
              </span>
              <PlanetSelect
                compact
                value={p}
                exclude={[route[i - 1], route[i + 1]].filter(Boolean) as PlanetId[]}
                onChange={(np) => setStop(i, np)}
              />
              {i > 0 && i < route.length - 1 && (
                <button
                  type="button"
                  title="Remove flyby"
                  onClick={() => removeStop(i)}
                  className="rounded border border-grid-line p-1 text-text-lo transition-colors hover:border-danger/60 hover:text-danger"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
        {route.length < 6 && (
          <button
            type="button"
            onClick={addFlyby}
            className="mt-1.5 flex items-center gap-1.5 rounded-full border border-grid-line px-2.5 py-0.5 font-mono text-[10px] tracking-wider text-text-lo uppercase transition-colors hover:border-accent/60 hover:text-accent"
          >
            <Plus size={10} /> add flyby
          </button>
        )}
        <div className="mt-2 flex items-center gap-2">
          <span className="font-mono text-[9.5px] tracking-wider text-text-lo uppercase">
            at {target}
          </span>
          <div className="flex overflow-hidden rounded border border-grid-line">
            {finishOptions.map((o) => (
              <button
                key={o.key}
                type="button"
                disabled={o.disabled}
                onClick={() => onFinish(o.key)}
                className={`px-2 py-0.5 font-mono text-[9.5px] tracking-wider uppercase transition-colors ${
                  finish === o.key
                    ? 'bg-accent/15 text-accent'
                    : o.disabled
                      ? 'cursor-not-allowed text-text-lo/40'
                      : 'text-text-lo hover:text-text-mid'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* departure */}
      <section>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] tracking-[0.14em] text-text-mid uppercase">Departure</span>
          <input
            type="date"
            value={isoDate(departMs)}
            onChange={(e) => {
              const t = Date.parse(e.target.value);
              if (Number.isFinite(t)) onDepartMs(t);
            }}
            className="rounded border border-grid-line bg-panel-2 px-1.5 py-0.5 font-mono text-[11px] text-text-hi [color-scheme:dark] outline-none focus:border-accent"
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="font-mono text-[9.5px] tracking-wider text-text-lo uppercase">
            optimizer slack
          </span>
          {[60, 180, 365].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onSlackDays(d)}
              className={`rounded-full border px-2 py-0.5 font-mono text-[9.5px] transition-colors ${
                slackDays === d
                  ? 'border-accent/60 bg-accent/10 text-accent'
                  : 'border-grid-line text-text-lo hover:text-text-mid'
              }`}
            >
              ±{d}d
            </button>
          ))}
        </div>
      </section>

      {/* leg flight times */}
      <section className="flex flex-col gap-2.5">
        <span className="text-[11px] tracking-[0.14em] text-text-mid uppercase">
          Leg flight times
        </span>
        {legTofDays.map((tof, i) => {
          const tH = hohmannTofDays(route[i], route[i + 1]);
          const min = Math.max(20, Math.round(0.2 * tH));
          const max = Math.round(4.5 * tH);
          const arrive = legStart + tof * DAY_MS;
          const row = (
            <div key={i}>
              <div className="flex items-baseline justify-between font-mono text-[10px]">
                <span className="text-text-lo uppercase">
                  {route[i]} → {route[i + 1]}
                </span>
                <span className="text-text-hi">
                  {tof} d <span className="text-text-lo">· arr {fmtDate(arrive)}</span>
                </span>
              </div>
              <input
                type="range"
                min={min}
                max={max}
                value={Math.min(max, Math.max(min, tof))}
                onChange={(e) => {
                  const next = legTofDays.slice();
                  next[i] = Number(e.target.value);
                  onLegTofDays(next);
                }}
                className="mt-0.5 h-1 w-full cursor-pointer appearance-none rounded bg-grid-line accent-[#3ab0ff]"
              />
            </div>
          );
          legStart = arrive;
          return row;
        })}
      </section>

      {/* optimizer */}
      <section>
        <button
          type="button"
          onClick={optimizing ? onCancelOptimize : onOptimize}
          className={`flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 font-mono text-[11px] tracking-[0.2em] uppercase transition-all ${
            optimizing
              ? 'border-danger/50 bg-danger/10 text-danger'
              : 'border-amber/60 bg-amber/10 text-amber hover:bg-amber/20'
          }`}
        >
          <Sparkles size={13} />
          {optimizing ? `searching… ${optEvals.toLocaleString()} evals — cancel` : 'Optimize tour'}
        </button>
        {optimizing && optBestDv !== null && (
          <div className="mt-1 text-center font-mono text-[10px] text-text-mid">
            best so far: {optBestDv.toFixed(2)} km/s
          </div>
        )}
        <p className="mt-1.5 text-[10px] leading-snug text-text-lo">
          coordinate-descent search over departure date (±{slackDays}d) and leg flight times —
          preliminary design scout, not a global optimizer
        </p>
      </section>

      <div className="mt-auto border-t border-grid-line pt-3 font-mono text-[10px] leading-relaxed text-text-lo">
        patched-conic flybys: turn bought with periapsis depth (min safe altitude enforced),
        v∞ mismatch + excess turn charged as propulsive Δv
      </div>
    </div>
  );
}
