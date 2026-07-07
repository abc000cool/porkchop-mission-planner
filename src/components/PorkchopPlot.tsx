import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { contours as d3Contours } from 'd3-contour';
import { scaleSequential, scaleSequentialLog } from 'd3-scale';
import {
  interpolateCividis,
  interpolateInferno,
  interpolatePlasma,
  interpolateTurbo,
  interpolateViridis,
} from 'd3-scale-chromatic';
import type { PorkchopGrid } from '../lib/porkchop';
import { fmtDate, fmtMonth, fmtNum } from '../lib/format';

export type PlotMetric = 'dv' | 'tof' | 'c3';

export const PALETTES = {
  turbo: interpolateTurbo,
  viridis: interpolateViridis,
  inferno: interpolateInferno,
  plasma: interpolatePlasma,
  cividis: interpolateCividis,
} as const;

export type PaletteName = keyof typeof PALETTES;

const METRIC_META: Record<PlotMetric, { label: string; log: boolean; clampQ: number }> = {
  dv: { label: 'Δv km/s', log: true, clampQ: 0.92 },
  tof: { label: 'TOF days', log: false, clampQ: 1 },
  c3: { label: 'C3 km²/s²', log: true, clampQ: 0.9 },
};

export interface HistoryDot {
  name: string;
  departMs: number;
  arriveMs: number;
}

interface Props {
  grid: PorkchopGrid | null;
  computing: boolean;
  progress: number;
  metric: PlotMetric;
  palette: PaletteName;
  locked: { departMs: number; arriveMs: number } | null;
  historyDots: HistoryDot[];
  onSelect: (departMs: number, arriveMs: number) => void;
}

interface HoverCell {
  iDep: number;
  iArr: number;
  px: number;
  py: number;
  departMs: number;
  arriveMs: number;
  totalDv: number;
  depC3: number;
  arrVinf: number;
  tofDays: number;
}

const M = { l: 74, r: 16, t: 16, b: 50 };
const N_BANDS = 30;

function useElementSize(): [React.RefObject<HTMLDivElement | null>, { w: number; h: number }] {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

function monthTicks(t0: number, t1: number, maxTicks: number): number[] {
  const d0 = new Date(t0);
  const monthsTotal =
    (new Date(t1).getUTCFullYear() - d0.getUTCFullYear()) * 12 +
    (new Date(t1).getUTCMonth() - d0.getUTCMonth()) +
    1;
  const step = [1, 2, 3, 4, 6, 12, 24, 48].find((s) => monthsTotal / s <= maxTicks) ?? 96;
  const ticks: number[] = [];
  let y = d0.getUTCFullYear();
  let m = d0.getUTCMonth() + 1; // first month boundary at/after t0
  m = Math.ceil(m / step) * step;
  for (;;) {
    const t = Date.UTC(y + Math.floor(m / 12), m % 12, 1);
    if (t > t1) break;
    if (t >= t0) ticks.push(t);
    m += step;
  }
  return ticks;
}

const quantile = (sorted: number[], q: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

export default function PorkchopPlot({
  grid,
  computing,
  progress,
  metric,
  palette,
  locked,
  historyDots,
  onSelect,
}: Props) {
  const [wrapRef, { w, h }] = useElementSize();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<HoverCell | null>(null);

  // stale tooltips must not survive a grid swap
  useEffect(() => setHover(null), [grid]);

  const layout = useMemo(() => {
    if (!grid || w < 160 || h < 160) return null;
    const nDep = grid.departDatesMs.length;
    const nArr = grid.arriveDatesMs.length;
    if (nDep < 2 || nArr < 2) return null;
    const dep0 = grid.departDatesMs[0];
    const dep1 = grid.departDatesMs[nDep - 1];
    const arr0 = grid.arriveDatesMs[0];
    const arr1 = grid.arriveDatesMs[nArr - 1];
    const plotW = w - M.l - M.r;
    const plotH = h - M.t - M.b;
    const xOfMs = (ms: number) => M.l + ((ms - dep0) / (dep1 - dep0)) * plotW;
    const yOfMs = (ms: number) => M.t + (1 - (ms - arr0) / (arr1 - arr0)) * plotH;
    // d3-contour index-space (cell centers at integer+0.5 offsets) → pixels
    const xOfCoord = (cx: number) => M.l + ((cx - 0.5) / (nDep - 1)) * plotW;
    const yOfCoord = (cy: number) => M.t + plotH - ((cy - 0.5) / (nArr - 1)) * plotH;
    return { nDep, nArr, dep0, dep1, arr0, arr1, plotW, plotH, xOfMs, yOfMs, xOfCoord, yOfCoord };
  }, [grid, w, h]);

  const metricValues = useMemo(() => {
    if (!grid) return null;
    return metric === 'dv' ? grid.totalDv : metric === 'tof' ? grid.tofDays : grid.depC3;
  }, [grid, metric]);

  const scaleInfo = useMemo(() => {
    if (!grid || !grid.min || !metricValues) return null;
    const meta = METRIC_META[metric];
    const interp = PALETTES[palette];
    const finite = Array.from(metricValues).filter(Number.isFinite);
    if (finite.length < 8) return null;
    finite.sort((a, b) => a - b);
    const lo = Math.max(finite[0], 1e-6);
    let hi = quantile(finite, meta.clampQ);
    if (!(hi > lo)) hi = lo * 1.5 + 1e-6;
    const thresholds = meta.log
      ? Array.from({ length: N_BANDS }, (_, i) => lo * Math.pow(hi / lo, i / (N_BANDS - 1)))
      : Array.from({ length: N_BANDS }, (_, i) => lo + ((hi - lo) * i) / (N_BANDS - 1));
    const color = meta.log
      ? scaleSequentialLog(interp).domain([lo, hi])
      : scaleSequential(interp).domain([lo, hi]);
    return { lo, hi, thresholds, color, label: meta.label };
  }, [grid, metric, palette, metricValues]);

  // ---- canvas contour rendering ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layout) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const { nDep, nArr, plotW, plotH, xOfCoord, yOfCoord, xOfMs, yOfMs, dep0, dep1, arr0 } =
      layout;

    // plot backdrop
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(M.l, M.t, plotW, plotH);

    if (grid && scaleInfo && metricValues) {
      const { thresholds, color, hi } = scaleInfo;
      // replace NaN with a large sentinel so marching squares stays smooth;
      // the invalid diagonal is masked afterwards
      const vals = Array.from(metricValues, (v) => (Number.isFinite(v) ? v : hi * 8));
      const contourGen = d3Contours().size([nDep, nArr]).thresholds(thresholds);
      const bands = contourGen(vals);

      ctx.save();
      ctx.beginPath();
      ctx.rect(M.l, M.t, plotW, plotH);
      ctx.clip();

      const trace = (mp: (typeof bands)[number]) => {
        ctx.beginPath();
        for (const poly of mp.coordinates) {
          for (const ring of poly) {
            for (let i = 0; i < ring.length; i++) {
              const x = xOfCoord(ring[i][0]);
              const y = yOfCoord(ring[i][1]);
              if (i === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
            ctx.closePath();
          }
        }
      };

      // fill below the first threshold with the "best" color
      ctx.fillStyle = color(thresholds[0]);
      ctx.fillRect(M.l, M.t, plotW, plotH);
      for (const band of bands) {
        trace(band);
        ctx.fillStyle = color(band.value);
        ctx.fill('evenodd');
      }
      // contour lines
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(6, 6, 10, 0.45)';
      for (let i = 0; i < bands.length; i += 2) {
        trace(bands[i]);
        ctx.stroke();
      }

      // mask the invalid region (arrival before departure)
      if (arr0 < dep1) {
        const yA = yOfMs(dep0);
        const yB = yOfMs(dep1);
        ctx.beginPath();
        ctx.moveTo(xOfMs(dep0), yA);
        ctx.lineTo(xOfMs(dep1), yB);
        ctx.lineTo(xOfMs(dep1), M.t + plotH);
        ctx.lineTo(xOfMs(dep0), M.t + plotH);
        ctx.closePath();
        ctx.fillStyle = '#08080e';
        ctx.fill();
        ctx.strokeStyle = 'rgba(90, 98, 116, 0.4)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(xOfMs(dep0), yA);
        ctx.lineTo(xOfMs(dep1), yB);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    }

    // frame
    ctx.strokeStyle = '#1c1c2a';
    ctx.lineWidth = 1;
    ctx.strokeRect(M.l + 0.5, M.t + 0.5, plotW - 1, plotH - 1);
  }, [grid, layout, scaleInfo, metricValues, w, h]);

  // ---- hover handling ----
  const onPointerMove = (e: React.PointerEvent) => {
    if (!grid || !layout) return;
    const rect = wrapRef.current!.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const { nDep, nArr, dep0, dep1, arr0, arr1, plotW, plotH, xOfMs, yOfMs } = layout;
    if (px < M.l || px > M.l + plotW || py < M.t || py > M.t + plotH) {
      setHover(null);
      return;
    }
    const depMsRaw = dep0 + ((px - M.l) / plotW) * (dep1 - dep0);
    const arrMsRaw = arr0 + (1 - (py - M.t) / plotH) * (arr1 - arr0);
    const stepMs = grid.departDatesMs[1] - grid.departDatesMs[0];
    const iDep = Math.min(nDep - 1, Math.max(0, Math.round((depMsRaw - dep0) / stepMs)));
    const iArr = Math.min(nArr - 1, Math.max(0, Math.round((arrMsRaw - arr0) / stepMs)));
    const idx = iArr * nDep + iDep;
    const dv = grid.totalDv[idx];
    if (!Number.isFinite(dv)) {
      setHover(null);
      return;
    }
    const departMs = grid.departDatesMs[iDep];
    const arriveMs = grid.arriveDatesMs[iArr];
    setHover({
      iDep,
      iArr,
      px: xOfMs(departMs),
      py: yOfMs(arriveMs),
      departMs,
      arriveMs,
      totalDv: dv,
      depC3: grid.depC3[idx],
      arrVinf: grid.arrVinf[idx],
      tofDays: grid.tofDays[idx],
    });
  };

  const xTicks = layout ? monthTicks(layout.dep0, layout.dep1, Math.max(4, layout.plotW / 90)) : [];
  const yTicks = layout ? monthTicks(layout.arr0, layout.arr1, Math.max(4, layout.plotH / 60)) : [];

  const min = grid?.min ?? null;
  const minPx = min && layout ? layout.xOfMs(min.departMs) : 0;
  const minPy = min && layout ? layout.yOfMs(min.arriveMs) : 0;

  const legendGradient = useMemo(() => {
    if (!scaleInfo) return '';
    const interp = PALETTES[palette];
    const stops = Array.from({ length: 13 }, (_, i) => interp(i / 12)).join(', ');
    return `linear-gradient(to right, ${stops})`;
  }, [scaleInfo, palette]);

  const lockedPx =
    locked && layout
      ? { x: layout.xOfMs(locked.departMs), y: layout.yOfMs(locked.arriveMs) }
      : null;

  const tooltipLeft = hover ? (hover.px > w - 240 ? hover.px - 218 : hover.px + 16) : 0;
  const tooltipTop = hover ? Math.max(8, hover.py - 118) : 0;

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full cursor-crosshair"
      onPointerMove={onPointerMove}
      onPointerLeave={() => setHover(null)}
      onClick={() => {
        if (hover) onSelect(hover.departMs, hover.arriveMs);
      }}
    >
      <canvas
        ref={canvasRef}
        data-porkchop-canvas
        className="absolute inset-0"
        style={{ width: w, height: h }}
      />

      {layout && (
        <svg className="pointer-events-none absolute inset-0" width={w} height={h}>
          {/* x axis */}
          {xTicks.map((t) => {
            const x = layout.xOfMs(t);
            return (
              <g key={`x${t}`}>
                <line
                  x1={x}
                  x2={x}
                  y1={M.t}
                  y2={M.t + layout.plotH}
                  stroke="#e8ecf4"
                  strokeOpacity={0.05}
                />
                <line
                  x1={x}
                  x2={x}
                  y1={M.t + layout.plotH}
                  y2={M.t + layout.plotH + 5}
                  stroke="#5a6274"
                />
                <text
                  x={x}
                  y={M.t + layout.plotH + 17}
                  textAnchor="middle"
                  className="fill-text-lo font-mono text-[10px]"
                >
                  {fmtMonth(t)}
                </text>
              </g>
            );
          })}
          <text
            x={M.l + layout.plotW / 2}
            y={h - 8}
            textAnchor="middle"
            className="fill-text-mid font-mono text-[10px] tracking-[0.25em]"
          >
            DEPARTURE DATE →
          </text>

          {/* y axis */}
          {yTicks.map((t) => {
            const y = layout.yOfMs(t);
            return (
              <g key={`y${t}`}>
                <line
                  x1={M.l}
                  x2={M.l + layout.plotW}
                  y1={y}
                  y2={y}
                  stroke="#e8ecf4"
                  strokeOpacity={0.05}
                />
                <line x1={M.l - 5} x2={M.l} y1={y} y2={y} stroke="#5a6274" />
                <text
                  x={M.l - 9}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-text-lo font-mono text-[10px]"
                >
                  {fmtMonth(t)}
                </text>
              </g>
            );
          })}
          <text
            x={14}
            y={M.t + layout.plotH / 2}
            textAnchor="middle"
            transform={`rotate(-90 14 ${M.t + layout.plotH / 2})`}
            className="fill-text-mid font-mono text-[10px] tracking-[0.25em]"
          >
            ARRIVAL DATE →
          </text>

          {/* hover crosshair */}
          {hover && (
            <g>
              <line
                x1={hover.px}
                x2={hover.px}
                y1={M.t}
                y2={M.t + layout.plotH}
                stroke="#3ab0ff"
                strokeOpacity={0.5}
                strokeDasharray="3 3"
              />
              <line
                x1={M.l}
                x2={M.l + layout.plotW}
                y1={hover.py}
                y2={hover.py}
                stroke="#3ab0ff"
                strokeOpacity={0.5}
                strokeDasharray="3 3"
              />
              <circle cx={hover.px} cy={hover.py} r={4} fill="none" stroke="#3ab0ff" strokeWidth={1.5} />
            </g>
          )}

          {/* historical missions */}
          {layout &&
            historyDots
              .filter(
                (d) =>
                  d.departMs >= layout.dep0 &&
                  d.departMs <= layout.dep1 &&
                  d.arriveMs >= layout.arr0 &&
                  d.arriveMs <= layout.arr1,
              )
              .map((d) => {
                const x = layout.xOfMs(d.departMs);
                const y = layout.yOfMs(d.arriveMs);
                return (
                  <g
                    key={d.name}
                    className="pointer-events-auto cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(d.departMs, d.arriveMs);
                    }}
                  >
                    <title>
                      {d.name} — launched {fmtDate(d.departMs)}, arrived {fmtDate(d.arriveMs)}.
                      Click to lock.
                    </title>
                    <circle cx={x} cy={y} r={7} fill="transparent" />
                    <circle
                      cx={x}
                      cy={y}
                      r={3}
                      fill="#e8ecf4"
                      stroke="#06060a"
                      strokeWidth={1.2}
                    />
                    <circle cx={x} cy={y} r={5} fill="none" stroke="#e8ecf4" strokeOpacity={0.5} />
                  </g>
                );
              })}

          {/* locked window marker */}
          {lockedPx && (
            <g>
              <rect
                x={lockedPx.x - 4.5}
                y={lockedPx.y - 4.5}
                width={9}
                height={9}
                fill="none"
                stroke="#3ab0ff"
                strokeWidth={1.6}
                transform={`rotate(45 ${lockedPx.x} ${lockedPx.y})`}
              />
              <circle cx={lockedPx.x} cy={lockedPx.y} r={1.8} fill="#3ab0ff" />
              <text
                x={lockedPx.x + 10}
                y={lockedPx.y + 13}
                className="fill-accent font-mono text-[10px] tracking-widest"
              >
                LOCKED
              </text>
            </g>
          )}

          {/* global minimum marker */}
          {min && (
            <g>
              <circle cx={minPx} cy={minPy} r={7} fill="none" stroke="#ffb347" strokeWidth={1.5}>
                <animate attributeName="r" values="5;11;5" dur="2.4s" repeatCount="indefinite" />
                <animate
                  attributeName="stroke-opacity"
                  values="0.9;0.1;0.9"
                  dur="2.4s"
                  repeatCount="indefinite"
                />
              </circle>
              <path
                d={`M ${minPx} ${minPy - 5} L ${minPx + 5} ${minPy} L ${minPx} ${minPy + 5} L ${minPx - 5} ${minPy} Z`}
                fill="#ffb347"
              />
              <text
                x={minPx + 11}
                y={minPy - 9}
                className="fill-amber font-mono text-[10px] tracking-widest"
              >
                MIN Δv {fmtNum(min.totalDv)} km/s
              </text>
            </g>
          )}
        </svg>
      )}

      {/* legend */}
      {scaleInfo && (
        <div className="absolute top-6 right-7 flex items-center gap-2 rounded border border-grid-line bg-void/80 px-2.5 py-1.5 backdrop-blur-sm">
          <span className="font-mono text-[10px] text-text-mid">
            {fmtNum(scaleInfo.lo, 1)}
          </span>
          <div className="h-2 w-36 rounded-sm" style={{ background: legendGradient }} />
          <span className="font-mono text-[10px] text-text-mid">
            ≥{fmtNum(scaleInfo.hi, 1)}
          </span>
          <span className="ml-1 font-mono text-[10px] tracking-wider text-text-lo">
            {scaleInfo.label}
            {METRIC_META[metric].log ? ' · log' : ''}
          </span>
        </div>
      )}

      {/* computing overlay */}
      <AnimatePresence>
        {computing && layout && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute"
            style={{ left: M.l, top: M.t, width: layout.plotW, height: layout.plotH }}
          >
            <div className="absolute inset-0 bg-void/40" />
            <div
              className="absolute right-0 left-0 h-[2px] bg-accent shadow-[0_0_16px_rgba(58,176,255,0.9)]"
              style={{ top: `${(1 - progress) * 100}%` }}
            />
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded border border-accent/40 bg-void/85 px-3 py-1 font-mono text-[11px] tracking-[0.2em] text-accent">
              SOLVING LAMBERT GRID · {Math.round(progress * 100)}%
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* first-load state */}
      {!grid && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="animate-pulse font-mono text-xs tracking-[0.3em] text-text-lo">
            INITIALIZING EPHEMERIS…
          </span>
        </div>
      )}

      {/* tooltip */}
      <AnimatePresence>
        {hover && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            className="pointer-events-none absolute z-20 w-[202px] rounded-md border border-accent/30 bg-void/92 p-2.5 shadow-[0_8px_28px_rgba(0,0,0,0.7)] backdrop-blur-sm"
            style={{ left: tooltipLeft, top: tooltipTop }}
          >
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-[11px]">
              <span className="text-text-lo">DEP</span>
              <span className="text-right text-text-hi">{fmtDate(hover.departMs)}</span>
              <span className="text-text-lo">ARR</span>
              <span className="text-right text-text-hi">{fmtDate(hover.arriveMs)}</span>
              <span className="text-text-lo">Δv</span>
              <span className="text-right font-medium text-accent">
                {fmtNum(hover.totalDv)} km/s
              </span>
              <span className="text-text-lo">C3</span>
              <span className="text-right text-text-hi">{fmtNum(hover.depC3, 1)} km²/s²</span>
              <span className="text-text-lo">v∞ arr</span>
              <span className="text-right text-text-hi">{fmtNum(hover.arrVinf)} km/s</span>
              <span className="text-text-lo">TOF</span>
              <span className="text-right text-text-hi">{Math.round(hover.tofDays)} d</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
