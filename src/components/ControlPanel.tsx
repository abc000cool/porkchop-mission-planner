import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowDownUp, Crosshair, Grid3X3, Orbit, Wind } from 'lucide-react';
import DualDateSlider from './DualDateSlider';
import PlanetSelect from './PlanetSelect';
import { DAY_MS, PLANETS, type PlanetId } from '../lib/orbitalConstants';
import type { GridMinimum } from '../lib/porkchop';
import type { Difficulty } from '../lib/difficulty';
import { hohmannTofDays } from '../lib/defaults';
import { fmtDate, fmtInt, fmtNum } from '../lib/format';

interface Props {
  departPlanet: PlanetId;
  arrivePlanet: PlanetId;
  departRange: [number, number];
  arriveRange: [number, number];
  arrivalAuto: boolean;
  aerocapture: boolean;
  prograde: boolean;
  maxRevs: number;
  stepDays: number;
  gridDims: [number, number];
  computing: boolean;
  progress: number;
  minimum: GridMinimum | null;
  difficulty: Difficulty | null;
  onPlanets: (dep: PlanetId, arr: PlanetId) => void;
  onDepartRange: (r: [number, number]) => void;
  onArriveRange: (r: [number, number]) => void;
  onArrivalAuto: (auto: boolean) => void;
  onAerocapture: (on: boolean) => void;
  onPrograde: (prograde: boolean) => void;
  onMaxRevs: (revs: number) => void;
}

/** Live T− countdown to a departure timestamp. */
function Countdown({ targetMs }: { targetMs: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const d = targetMs - now;
  if (d <= 0) return <span className="text-text-lo">departure passed</span>;
  const days = Math.floor(d / 86_400_000);
  const h = Math.floor((d % 86_400_000) / 3_600_000);
  const m = Math.floor((d % 3_600_000) / 60_000);
  const s = Math.floor((d % 60_000) / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <span className="text-amber">
      T−{days}d {pad(h)}:{pad(m)}:{pad(s)}
    </span>
  );
}

const NOW = Date.now();

export default function ControlPanel({
  departPlanet,
  arrivePlanet,
  departRange,
  arriveRange,
  arrivalAuto,
  aerocapture,
  prograde,
  maxRevs,
  stepDays,
  gridDims,
  computing,
  progress,
  minimum,
  difficulty,
  onPlanets,
  onDepartRange,
  onArriveRange,
  onArrivalAuto,
  onAerocapture,
  onPrograde,
  onMaxRevs,
}: Props) {
  const canAerocapture = PLANETS[arrivePlanet].hasAtmosphere;
  const tH = hohmannTofDays(departPlanet, arrivePlanet);
  const depSliderMin = NOW - 400 * DAY_MS;
  const depSliderMax = NOW + 8 * 365.25 * DAY_MS;
  const arrSliderMin = departRange[0];
  const arrSliderMax = departRange[1] + Math.round(3.2 * tH) * DAY_MS;

  return (
    <div className="flex h-full flex-col gap-5">
      {/* Route */}
      <section>
        <div className="flex items-end gap-2">
          <PlanetSelect
            label="Departure"
            value={departPlanet}
            exclude={arrivePlanet}
            onChange={(p) => onPlanets(p, arrivePlanet)}
          />
          <button
            type="button"
            title="Swap planets"
            onClick={() => onPlanets(arrivePlanet, departPlanet)}
            className="mb-0.5 rounded-md border border-grid-line bg-panel-2 p-2 text-text-mid transition-colors hover:border-accent-dim hover:text-accent"
          >
            <ArrowDownUp size={14} />
          </button>
          <PlanetSelect
            label="Arrival"
            value={arrivePlanet}
            exclude={departPlanet}
            onChange={(p) => onPlanets(departPlanet, p)}
          />
        </div>
      </section>

      {/* Date ranges */}
      <section className="flex flex-col gap-4">
        <DualDateSlider
          label="Departure window"
          minMs={depSliderMin}
          maxMs={depSliderMax}
          startMs={departRange[0]}
          endMs={departRange[1]}
          onChange={(s, e) => onDepartRange([s, e])}
        />
        <div>
          <DualDateSlider
            label="Arrival window"
            minMs={arrSliderMin}
            maxMs={arrSliderMax}
            startMs={arriveRange[0]}
            endMs={arriveRange[1]}
            onChange={(s, e) => {
              onArrivalAuto(false);
              onArriveRange([s, e]);
            }}
          />
          <button
            type="button"
            onClick={() => onArrivalAuto(!arrivalAuto)}
            className={`mt-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] tracking-widest uppercase transition-colors ${
              arrivalAuto
                ? 'border-accent/60 bg-accent/10 text-accent'
                : 'border-grid-line text-text-lo hover:border-accent-dim hover:text-text-mid'
            }`}
          >
            auto-track transfer times {arrivalAuto ? 'on' : 'off'}
          </button>
        </div>
      </section>

      {/* Arrival mode */}
      {canAerocapture && (
        <section className="flex items-center justify-between rounded-md border border-grid-line bg-panel-2/60 px-3 py-2">
          <div className="flex items-center gap-2">
            <Wind size={13} className={aerocapture ? 'text-accent' : 'text-text-lo'} />
            <div>
              <div className="text-[11px] font-medium text-text-hi">Aerocapture</div>
              <div className="text-[10px] text-text-lo">
                {aerocapture
                  ? `${arrivePlanet}'s atmosphere brakes — capture Δv ≈ 0`
                  : 'propulsive capture at arrival'}
              </div>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={aerocapture}
            onClick={() => onAerocapture(!aerocapture)}
            className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${
              aerocapture ? 'border-accent/70 bg-accent/30' : 'border-grid-line bg-panel'
            }`}
          >
            <span
              className={`absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full transition-all ${
                aerocapture
                  ? 'left-[18px] bg-accent shadow-[0_0_8px_rgba(58,176,255,0.8)]'
                  : 'left-[3px] bg-text-lo'
              }`}
            />
          </button>
        </section>
      )}

      {/* Solver options */}
      <section className="rounded-md border border-grid-line bg-panel-2/60 px-3 py-2.5">
        <div className="flex items-center gap-2 text-[11px] tracking-[0.14em] text-text-mid uppercase">
          <Orbit size={12} className="text-accent" /> Lambert solver
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex overflow-hidden rounded border border-grid-line">
            {(
              [
                [true, 'prograde'],
                [false, 'retrograde'],
              ] as const
            ).map(([val, label]) => (
              <button
                key={label}
                type="button"
                onClick={() => onPrograde(val)}
                className={`px-2 py-1 font-mono text-[10px] tracking-wider uppercase transition-colors ${
                  prograde === val
                    ? 'bg-accent/15 text-accent'
                    : 'text-text-lo hover:text-text-mid'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] tracking-wider text-text-lo uppercase">
              revs
            </span>
            <div className="flex overflow-hidden rounded border border-grid-line">
              {[0, 1].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => onMaxRevs(r)}
                  title={r === 0 ? 'direct transfers only' : 'include 1-revolution solutions'}
                  className={`px-2 py-1 font-mono text-[10px] transition-colors ${
                    maxRevs === r ? 'bg-accent/15 text-accent' : 'text-text-lo hover:text-text-mid'
                  }`}
                >
                  {r === 0 ? '0' : '≤1'}
                </button>
              ))}
            </div>
          </div>
        </div>
        {(!prograde || maxRevs > 0) && (
          <div className="mt-1.5 text-[10px] leading-snug text-amber/80">
            {!prograde && 'retrograde transfers are usually far more expensive — for exploration. '}
            {maxRevs > 0 && 'multi-rev: each cell keeps its cheapest branch.'}
          </div>
        )}
      </section>

      {/* Grid stats */}
      <section className="rounded-md border border-grid-line bg-panel-2/60 px-3 py-2.5">
        <div className="flex items-center gap-2 text-[11px] tracking-[0.14em] text-text-mid uppercase">
          <Grid3X3 size={12} className="text-accent" /> Lambert grid
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px]">
          <span className="text-text-lo">resolution</span>
          <span className="text-right text-text-hi">{stepDays} day{stepDays > 1 ? 's' : ''}</span>
          <span className="text-text-lo">grid</span>
          <span className="text-right text-text-hi">
            {gridDims[0]} × {gridDims[1]}
          </span>
          <span className="text-text-lo">solutions</span>
          <span className="text-right text-text-hi">{fmtInt(gridDims[0] * gridDims[1])}</span>
        </div>
        {computing && (
          <div className="mt-2">
            <div className="h-1 overflow-hidden rounded bg-grid-line">
              <motion.div
                className="h-full bg-accent shadow-[0_0_8px_rgba(58,176,255,0.8)]"
                animate={{ width: `${Math.round(progress * 100)}%` }}
                transition={{ duration: 0.1, ease: 'linear' }}
              />
            </div>
            <div className="mt-1 font-mono text-[10px] tracking-widest text-accent uppercase">
              solving · {Math.round(progress * 100)}%
            </div>
          </div>
        )}
      </section>

      {/* Optimal window */}
      <section className="rounded-md border border-amber-dim/70 bg-amber/[0.04] px-3 py-2.5">
        <div className="flex items-center gap-2 text-[11px] tracking-[0.14em] text-amber uppercase">
          <Crosshair size={12} /> Optimal window
        </div>
        {minimum ? (
          <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px]">
            <span className="text-text-lo">depart</span>
            <span className="text-right text-text-hi">{fmtDate(minimum.departMs)}</span>
            <span className="text-text-lo">arrive</span>
            <span className="text-right text-text-hi">{fmtDate(minimum.arriveMs)}</span>
            <span className="text-text-lo">total Δv</span>
            <span className="text-right font-medium text-amber">
              {fmtNum(minimum.totalDv)} km/s
            </span>
            <span className="text-text-lo">C3</span>
            <span className="text-right text-text-hi">{fmtNum(minimum.depC3, 1)} km²/s²</span>
            <span className="text-text-lo">arrival v∞</span>
            <span className="text-right text-text-hi">{fmtNum(minimum.arrVinf)} km/s</span>
            <span className="text-text-lo">flight time</span>
            <span className="text-right text-text-hi">{Math.round(minimum.tofDays)} days</span>
            <span className="text-text-lo">countdown</span>
            <span className="text-right">
              <Countdown targetMs={minimum.departMs} />
            </span>
            {difficulty && (
              <>
                <span className="text-text-lo">window width</span>
                <span className="text-right text-text-hi">
                  ~{Math.round(difficulty.windowDays)} days
                </span>
                <span className="text-text-lo">difficulty</span>
                <span className="text-right">
                  <span
                    className="rounded-full border px-1.5 py-px text-[10px] tracking-wider uppercase"
                    style={{
                      color: difficulty.color,
                      borderColor: `${difficulty.color}66`,
                      background: `${difficulty.color}14`,
                    }}
                  >
                    {difficulty.score} · {difficulty.label}
                  </span>
                </span>
              </>
            )}
          </div>
        ) : (
          <p className="mt-1.5 font-mono text-[11px] text-text-lo">
            {computing ? 'scanning…' : 'no valid transfer in range'}
          </p>
        )}
      </section>

      <div className="mt-auto border-t border-grid-line pt-3 font-mono text-[10px] leading-relaxed text-text-lo">
        Izzo Lambert solver · astronomy-engine ephemeris (ecliptic J2000) · Δv = LEO-equivalent
        departure burn + capture burn at destination parking orbit
      </div>
    </div>
  );
}
