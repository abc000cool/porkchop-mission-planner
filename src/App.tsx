import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Download, History, Link2 } from 'lucide-react';
import ControlPanel from './components/ControlPanel';
import MissionDesigner from './components/MissionDesigner';
import MissionDetailPanel from './components/MissionDetailPanel';
import PorkchopPlot, { type PaletteName, type PlotMetric } from './components/PorkchopPlot';
import RocketPayloadMapper from './components/RocketPayloadMapper';
import WindowsTable from './components/WindowsTable';
import { usePorkchopGrid } from './hooks/usePorkchopGrid';
import { downloadText, gridToCsv } from './lib/csv';
import { suggestArrivalRange, suggestDepartureRange, suggestStepDays } from './lib/defaults';
import { missionDifficulty } from './lib/difficulty';
import { fmtInt, fmtNum, isoDate } from './lib/format';
import { MARS_MISSIONS } from './lib/history';
import { buildMission, type Mission } from './lib/mission';
import { PLANETS, type PlanetId } from './lib/orbitalConstants';
import { decodeShareState, encodeShareState } from './lib/permalink';
import { findTopWindows, gridDates, type PorkchopParams } from './lib/porkchop';
import { ROCKET_BY_ID } from './lib/rocketData';

const SolarSystem3D = lazy(() => import('./components/SolarSystem3D'));

const NOW = Date.now();
const URL_STATE = typeof window !== 'undefined' ? decodeShareState(window.location.search) : null;

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

function initialConfig(): MissionConfig {
  const base = defaultConfig(URL_STATE?.departPlanet ?? 'Earth', URL_STATE?.arrivePlanet ?? 'Mars');
  if (URL_STATE?.departRange) base.departRange = URL_STATE.departRange;
  if (URL_STATE?.arriveRange) {
    base.arriveRange = URL_STATE.arriveRange;
    base.arrivalAuto = URL_STATE.arrivalAuto ?? true;
  } else if (URL_STATE?.departRange) {
    base.arriveRange = suggestArrivalRange(
      base.departRange[0],
      base.departRange[1],
      base.departPlanet,
      base.arrivePlanet,
    );
  }
  return base;
}

const METRIC_OPTIONS: { key: PlotMetric; label: string }[] = [
  { key: 'dv', label: 'Δv' },
  { key: 'tof', label: 'TOF' },
  { key: 'c3', label: 'C3' },
];

const PALETTE_OPTIONS: PaletteName[] = ['turbo', 'viridis', 'inferno', 'plasma', 'cividis'];

export default function App() {
  const [config, setConfig] = useState<MissionConfig>(initialConfig);
  const [metric, setMetric] = useState<PlotMetric>((URL_STATE?.metric as PlotMetric) ?? 'dv');
  const [palette, setPalette] = useState<PaletteName>(
    URL_STATE?.palette && URL_STATE.palette in { turbo: 1, viridis: 1, inferno: 1, plasma: 1, cividis: 1 }
      ? (URL_STATE.palette as PaletteName)
      : 'turbo',
  );
  const [aerocapture, setAerocapture] = useState(URL_STATE?.aerocapture ?? false);
  const [rocketId, setRocketId] = useState(
    URL_STATE?.rocketId && URL_STATE.rocketId in ROCKET_BY_ID ? URL_STATE.rocketId : 'falconHeavy',
  );
  const [showHistory, setShowHistory] = useState(true);
  const [locked, setLocked] = useState<Mission | null>(null);
  const [show3D, setShow3D] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
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
      aerocapture,
    }),
    [config, stepDays, aerocapture],
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
  const difficulty = useMemo(
    () => (grid?.min ? missionDifficulty(grid, grid.min) : null),
    [grid],
  );

  const historyDots = useMemo(() => {
    if (!showHistory || config.departPlanet !== 'Earth' || config.arrivePlanet !== 'Mars')
      return [];
    return MARS_MISSIONS.map((m) => ({
      name: m.name,
      departMs: Date.parse(m.launch),
      arriveMs: Date.parse(m.arrival),
    }));
  }, [showHistory, config.departPlanet, config.arrivePlanet]);

  const lockWindow = useCallback(
    (departMs: number, arriveMs: number) => {
      const mission = buildMission(
        config.departPlanet,
        config.arrivePlanet,
        departMs,
        arriveMs,
        aerocapture,
      );
      if (!mission) return;
      setLocked(mission);
      if (!userClosed3D.current) setShow3D(true);
    },
    [config.departPlanet, config.arrivePlanet, aerocapture],
  );

  // restore a locked window from the permalink, once
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (URL_STATE?.lockedDepartMs && URL_STATE?.lockedArriveMs) {
      lockWindow(URL_STATE.lockedDepartMs, URL_STATE.lockedArriveMs);
    }
  }, [lockWindow]);

  // keep the URL shareable
  useEffect(() => {
    const qs = encodeShareState({
      departPlanet: config.departPlanet,
      arrivePlanet: config.arrivePlanet,
      departRange: config.departRange,
      arriveRange: config.arriveRange,
      arrivalAuto: config.arrivalAuto,
      metric,
      palette,
      aerocapture,
      rocketId,
      lockedDepartMs: locked?.departMs ?? null,
      lockedArriveMs: locked?.arriveMs ?? null,
    });
    window.history.replaceState(null, '', `${window.location.pathname}?${qs}`);
  }, [config, metric, palette, aerocapture, rocketId, locked]);

  const onPlanets = useCallback((dep: PlanetId, arr: PlanetId) => {
    setConfig(defaultConfig(dep, arr));
    setLocked(null);
    setShow3D(false);
    userClosed3D.current = false;
    if (!PLANETS[arr].hasAtmosphere) setAerocapture(false);
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

  const onAerocapture = useCallback(
    (on: boolean) => {
      setAerocapture(on);
      setLocked((m) =>
        m ? buildMission(m.departPlanet, m.arrivePlanet, m.departMs, m.arriveMs, on) : m,
      );
    },
    [],
  );

  const copyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1600);
    });
  }, []);

  const exportCsv = useCallback(() => {
    if (!grid) return;
    downloadText(
      `porkchop_${config.departPlanet}_${config.arrivePlanet}_${isoDate(config.departRange[0])}.csv`,
      gridToCsv(grid),
    );
  }, [grid, config]);

  const missionC3 = locked?.depC3 ?? grid?.min?.depC3 ?? null;

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
        <div className="flex items-center gap-3 font-mono text-[11px] tracking-wider text-text-mid">
          <span>
            <span className="text-accent">{config.departPlanet.toUpperCase()}</span>
            <span className="mx-1.5 text-text-lo">→</span>
            <span className="text-amber">{config.arrivePlanet.toUpperCase()}</span>
          </span>
          {grid && !computing && (
            <span className="hidden text-text-lo lg:inline">
              {fmtInt(gridDims[0] * gridDims[1])} SOLUTIONS · {fmtNum(elapsedMs / 1000, 1)}
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
            aerocapture={aerocapture}
            stepDays={stepDays}
            gridDims={gridDims}
            computing={computing}
            progress={progress}
            minimum={grid?.min ?? null}
            difficulty={difficulty}
            onPlanets={onPlanets}
            onDepartRange={onDepartRange}
            onArriveRange={onArriveRange}
            onArrivalAuto={onArrivalAuto}
            onAerocapture={onAerocapture}
          />
        </aside>

        {/* center: toolbar + plot + docked 3D */}
        <main className="flex min-h-[420px] min-w-0 flex-1 flex-col p-2">
          <div className="mb-2 flex items-center justify-between gap-3 px-1">
            <div className="flex items-center gap-2">
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
              {config.departPlanet === 'Earth' && config.arrivePlanet === 'Mars' && (
                <button
                  type="button"
                  onClick={() => setShowHistory((s) => !s)}
                  title="Toggle historical Mars missions overlay"
                  className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[11px] tracking-wider transition-colors ${
                    showHistory
                      ? 'border-accent/50 bg-accent/10 text-accent'
                      : 'border-grid-line text-text-lo hover:text-text-mid'
                  }`}
                >
                  <History size={12} /> HISTORY
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <select
                value={palette}
                onChange={(e) => setPalette(e.target.value as PaletteName)}
                className="rounded-md border border-grid-line bg-panel-2 px-2 py-1 font-mono text-[11px] text-text-hi outline-none focus:border-accent"
                title="Color palette"
              >
                {PALETTE_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={copyLink}
                title="Copy shareable link"
                className="rounded-md border border-grid-line p-1.5 text-text-mid transition-colors hover:border-accent-dim hover:text-accent"
              >
                {linkCopied ? <Check size={13} className="text-ok" /> : <Link2 size={13} />}
              </button>
              <button
                type="button"
                onClick={exportCsv}
                disabled={!grid}
                title="Export grid as CSV"
                className="rounded-md border border-grid-line p-1.5 text-text-mid transition-colors hover:border-accent-dim hover:text-accent disabled:opacity-40"
              >
                <Download size={13} />
              </button>
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
              historyDots={historyDots}
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
                aerocapture={aerocapture}
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
          <RocketPayloadMapper
            rocketId={rocketId}
            onRocketId={setRocketId}
            c3={missionC3}
            c3Source={locked ? 'locked' : grid?.min ? 'optimal' : null}
          />
          <MissionDesigner grid={grid} onLock={lockWindow} />
        </aside>
      </div>
    </div>
  );
}
