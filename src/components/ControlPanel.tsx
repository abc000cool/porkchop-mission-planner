import { motion } from 'framer-motion';
import { ArrowDownUp, Crosshair, Grid3X3 } from 'lucide-react';
import DualDateSlider from './DualDateSlider';
import PlanetSelect from './PlanetSelect';
import { DAY_MS, type PlanetId } from '../lib/orbitalConstants';
import type { GridMinimum } from '../lib/porkchop';
import { hohmannTofDays } from '../lib/defaults';
import { fmtDate, fmtInt, fmtNum } from '../lib/format';

interface Props {
  departPlanet: PlanetId;
  arrivePlanet: PlanetId;
  departRange: [number, number];
  arriveRange: [number, number];
  arrivalAuto: boolean;
  stepDays: number;
  gridDims: [number, number];
  computing: boolean;
  progress: number;
  minimum: GridMinimum | null;
  onPlanets: (dep: PlanetId, arr: PlanetId) => void;
  onDepartRange: (r: [number, number]) => void;
  onArriveRange: (r: [number, number]) => void;
  onArrivalAuto: (auto: boolean) => void;
}

const NOW = Date.now();

export default function ControlPanel({
  departPlanet,
  arrivePlanet,
  departRange,
  arriveRange,
  arrivalAuto,
  stepDays,
  gridDims,
  computing,
  progress,
  minimum,
  onPlanets,
  onDepartRange,
  onArriveRange,
  onArrivalAuto,
}: Props) {
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
