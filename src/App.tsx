import { useCallback, useMemo, useState } from 'react';
import ControlPanel from './components/ControlPanel';
import PorkchopPlot from './components/PorkchopPlot';
import { usePorkchopGrid } from './hooks/usePorkchopGrid';
import {
  suggestArrivalRange,
  suggestDepartureRange,
  suggestStepDays,
} from './lib/defaults';
import { fmtInt, fmtNum } from './lib/format';
import type { PlanetId } from './lib/orbitalConstants';
import { gridDates, type PorkchopParams } from './lib/porkchop';

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

export default function App() {
  const [config, setConfig] = useState<MissionConfig>(() => defaultConfig('Earth', 'Mars'));

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

  const onPlanets = useCallback((dep: PlanetId, arr: PlanetId) => {
    setConfig(defaultConfig(dep, arr));
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

      <div className="flex min-h-0 flex-1">
        <aside className="w-[330px] shrink-0 overflow-y-auto border-r border-grid-line bg-panel p-4">
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
        <main className="min-w-0 flex-1 p-2">
          <PorkchopPlot grid={grid} computing={computing} progress={progress} />
        </main>
      </div>
    </div>
  );
}
