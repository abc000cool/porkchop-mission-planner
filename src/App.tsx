import { lazy, Suspense, useCallback, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import ControlPanel from './components/ControlPanel';
import MissionDetailPanel from './components/MissionDetailPanel';
import PorkchopPlot, { type PaletteName, type PlotMetric } from './components/PorkchopPlot';
import WindowsTable from './components/WindowsTable';
import { usePorkchopGrid } from './hooks/usePorkchopGrid';
import { suggestArrivalRange, suggestDepartureRange, suggestStepDays } from './lib/defaults';
import { fmtInt, fmtNum } from './lib/format';
import { buildMission, type Mission } from './lib/mission';
import type { PlanetId } from './lib/orbitalConstants';
import { findTopWindows, gridDates, type PorkchopParams } from './lib/porkchop';

const SolarSystem3D = lazy(() => import('./components/SolarSystem3D'));

const NOW = Date.now();

interface MissionConfig {
  departPlanet: PlanetId;
  arrivePlanet: PlanetId;
  departRange: [number, number];
  arriveRange: [number, number];
  arrivalAuto: boolean;
}

function defaultConfig(dep: PlanetId, arr: PlanetId): MissionConfig {
  const departRange = suggestDepartureRange(dep, arr, NOW);
  return {
    departPlanet: dep,
    arrivePlanet: arr,
    departRange,
    arriveRange: suggestArrivalRange(departRange[0], departRange[1], dep, arr),
    arrivalAuto: true,
  };
}

const METRIC_OPTIONS: { key: PlotMetric; label: string }[] = [
  { key: 'dv', label: 'Δv' },
  { key: 'tof', label: 'TOF' },
  { key: 'c3', label: 'C3' },
];

const PALETTE_OPTIONS: PaletteName[] = ['turbo', 'viridis', 'inferno', 'plasma', 'cividis'];

export default function App() {
  const [config, setConfig] = useState<MissionConfig>(() => defaultConfig('Earth', 'Mars'));
  const [metric, setMetric] = useState<PlotMetric>('dv');
  const [palette, setPalette] = useState<PaletteName>('turbo');
  const [locked, setLocked] = useState<Mission | null>(null);
  const [show3D, setShow3D] = useState(false);
  const userClosed3D = useRef(false);

  const stepDays = suggestStepDays(
    config.departRange[0],
    config.departRange[1],
    config.arriveRange[0],
    config.arriveRange[1],
  );

  const params: PorkchopParams = useMemo(
    () => ({
      departPlanet: config.departPlanet,
      arrivePlanet: config.arrivePlanet,
      departStartMs: config.departRange[0],
      departEndMs: config.departRange[1],
      arriveStartMs: config.arriveRange[0],
      arriveEndMs: config.arriveRange[1],
      stepDays,
    }),
    [config, stepDays],
  );

  const { grid, computing, progress, elapsedMs } = usePorkchopGrid(params);

  const gridDims: [number, number] = useMemo(
    () => [
      gridDates(params.departStartMs, params.departEndMs, params.stepDays).length,
      gridDates(params.arriveStartMs, params.arriveEndMs, params.stepDays).length,
    ],
    [params],
  );

  const topWindows = useMemo(() => (grid ? findTopWindows(grid, 5) : []), [grid]);

  const lockWindow = useCallback(
    (departMs: number, arriveMs: number) => {
      const mission = buildMission(config.departPlanet, config.arrivePlanet, departMs, arriveMs);
      if (!mission) return;
      setLocked(mission);
      if (!userClosed3D.current) setShow3D(true);
    },
    [config.departPlanet, config.arrivePlanet],
  );

  const onPlanets = useCallback((dep: PlanetId, arr: PlanetId) => {
    setConfig(defaultConfig(dep, arr));
    setLocked(null);
    setShow3D(false);
    userClosed3D.current = false;
  }, []);

  const onDepartRange = useCallback((r: [number, number]) => {
    setConfig((c) => ({
      ...c,
      departRange: r,
      arriveRange: c.arrivalAuto
        ? suggestArrivalRange(r[0], r[1], c.departPlanet, c.arrivePlanet)
        : c.arriveRange,
    }));
  }, []);

  const onArriveRange = useCallback((r: [number, number]) => {
    setConfig((c) => ({ ...c, arriveRange: r }));
  }, []);

  const onArrivalAuto = useCallback((auto: boolean) => {
    setConfig((c) => ({
      ...c,
      arrivalAuto: auto,
      arriveRange: auto
        ? suggestArrivalRange(c.departRange[0], c.departRange[1], c.departPlanet, c.arrivePlanet)
        : c.arriveRange,
    }));
  }, []);

  return (
    <div className="flex h-full flex-col bg-void">
      <header className="flex items-center justify-between border-b border-grid-line bg-panel px-5 py-2.5">
        <div className="flex items-baseline gap-3">
          <h1 className="font-mono text-sm font-bold tracking-[0.3em] text-text-hi">
            PORKCHOP<span className="text-accent">_</span>
          </h1>
          <span className="hidden text-[11px] tracking-[0.18em] text-text-lo uppercase sm:block">
            Interplanetary Mission Planner
          </span>
        </div>
        <div className="font-mono text-[11px] tracking-wider text-text-mid">
          <span className="text-accent">{config.departPlanet.toUpperCase()}</span>
          <span className="mx-1.5 text-text-lo">→</span>
          <span className="text-amber">{config.arrivePlanet.toUpperCase()}</span>
          {grid && !computing && (
            <span className="ml-4 hidden text-text-lo md:inline">
              {fmtInt(gridDims[0] * gridDims[1])} LAMBERT SOLUTIONS · {fmtNum(elapsedMs / 1000, 1)}
              &thinsp;s
            </span>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* controls */}
        <aside className="max-h-[45%] shrink-0 overflow-y-auto border-b border-grid-line bg-panel p-4 lg:max-h-none lg:w-[330px] lg:border-r lg:border-b-0">
          <ControlPanel
            departPlanet={config.departPlanet}
            arrivePlanet={config.arrivePlanet}
            departRange={config.departRange}
            arriveRange={config.arriveRange}
            arrivalAuto={config.arrivalAuto}
            stepDays={stepDays}
            gridDims={gridDims}
            computing={computing}
            progress={progress}
            minimum={grid?.min ?? null}
            onPlanets={onPlanets}
            onDepartRange={onDepartRange}
            onArriveRange={onArriveRange}
            onArrivalAuto={onArrivalAuto}
          />
        </aside>

        {/* center: toolbar + plot + docked 3D */}
        <main className="flex min-h-[420px] min-w-0 flex-1 flex-col p-2">
          <div className="mb-2 flex items-center justify-between gap-3 px-1">
            <div className="flex overflow-hidden rounded-md border border-grid-line">
              {METRIC_OPTIONS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMetric(m.key)}
                  className={`px-3 py-1 font-mono text-[11px] tracking-wider transition-colors ${
                    metric === m.key
                      ? 'bg-accent/15 text-accent'
                      : 'text-text-lo hover:bg-panel-2 hover:text-text-mid'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden font-mono text-[10px] tracking-widest text-text-lo uppercase sm:inline">
                palette
              </span>
              <select
                value={palette}
                onChange={(e) => setPalette(e.target.value as PaletteName)}
                className="rounded-md border border-grid-line bg-panel-2 px-2 py-1 font-mono text-[11px] text-text-hi outline-none focus:border-accent"
              >
                {PALETTE_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="min-h-0 flex-1">
            <PorkchopPlot
              grid={grid}
              computing={computing}
              progress={progress}
              metric={metric}
              palette={palette}
              locked={locked ? { departMs: locked.departMs, arriveMs: locked.arriveMs } : null}
              onSelect={lockWindow}
            />
          </div>

          <AnimatePresence>
            {show3D && locked && (
              <motion.div
                key="dock3d"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: '46%', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
                className="mt-2 shrink-0 overflow-hidden"
              >
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center rounded-md border border-grid-line bg-void font-mono text-xs tracking-[0.3em] text-text-lo">
                      LOADING 3D SYSTEM…
                    </div>
                  }
                >
                  <SolarSystem3D
                    mission={locked}
                    onClose={() => {
                      setShow3D(false);
                      userClosed3D.current = true;
                    }}
                  />
                </Suspense>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* right column */}
        <aside className="shrink-0 space-y-3 overflow-y-auto border-t border-grid-line bg-void p-3 lg:w-[300px] lg:border-t-0 lg:border-l">
          <WindowsTable
            windows={topWindows}
            lockedDepartMs={locked?.departMs ?? null}
            lockedArriveMs={locked?.arriveMs ?? null}
            onSelect={(win) => lockWindow(win.departMs, win.arriveMs)}
          />
          <AnimatePresence>
            {locked && (
              <MissionDetailPanel
                mission={locked}
                show3D={show3D}
                onToggle3D={() => {
                  setShow3D((s) => {
                    userClosed3D.current = s;
                    return !s;
                  });
                }}
                onClear={() => {
                  setLocked(null);
                  setShow3D(false);
                }}
              />
            )}
          </AnimatePresence>
          {!locked && (
            <div className="rounded-md border border-dashed border-grid-line px-3 py-6 text-center font-mono text-[11px] leading-relaxed text-text-lo">
              click any point on the plot
              <br />
              to lock in a launch window
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
