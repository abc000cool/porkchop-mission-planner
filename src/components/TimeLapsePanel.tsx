import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line, OrbitControls, Stars } from '@react-three/drei';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import * as THREE from 'three';
import { motion } from 'framer-motion';
import gsap from 'gsap';
import { Pause, Play, X } from 'lucide-react';
import { hohmannTofDays, synodicDays } from '../lib/defaults';
import { planetState } from '../lib/ephemeris';
import { fmtDate, fmtNum } from '../lib/format';
import { orbitLoop } from '../lib/mission';
import { DAY_MS, PLANETS, PLANET_IDS, type PlanetId } from '../lib/orbitalConstants';
import type { PorkchopGrid } from '../lib/porkchop';
import type { Vec3 } from '../lib/vec';
import {
  Planet,
  planetSceneSize,
  SafeCanvas,
  samplePath,
  Sun,
  toScene,
  useFxSafe,
} from './three/shared';

interface Props {
  departPlanet: PlanetId;
  arrivePlanet: PlanetId;
  startMs: number;
  grid: PorkchopGrid | null;
  onClose: () => void;
}

const SAMPLES = 360;

/** Lerp along a km-space path at fraction t. */
function lerpKm(path: Vec3[], t: number): Vec3 {
  const f = Math.min(1, Math.max(0, t)) * (path.length - 1);
  const i = Math.min(path.length - 2, Math.floor(f));
  const u = f - i;
  const a = path[i];
  const b = path[i + 1];
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}

/** Signed heliocentric phase angle (deg) of `to` ahead of `from`, ecliptic. */
function phaseAngleDeg(from: Vec3, to: Vec3): number {
  const a = Math.atan2(from[1], from[0]);
  const b = Math.atan2(to[1], to[0]);
  let d = ((b - a) * 180) / Math.PI;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

function LapseScene({
  shown,
  active,
  paths,
  orbits,
  scale,
  progress,
  effects,
}: {
  shown: PlanetId[];
  active: PlanetId[];
  paths: Record<PlanetId, [number, number, number][]>;
  orbits: Record<PlanetId, [number, number, number][]>;
  scale: number;
  progress: { t: number };
  effects: boolean;
}) {
  const fxSafe = useFxSafe();
  const refs = useRef<Partial<Record<PlanetId, THREE.Group>>>({});

  useFrame(() => {
    for (const id of shown) {
      const g = refs.current[id];
      if (g) g.position.set(...samplePath(paths[id], progress.t));
    }
  });

  return (
    <>
      <ambientLight intensity={0.12} />
      <pointLight position={[0, 0, 0]} intensity={3.2} decay={0} color="#fff2dd" />
      <Stars
        radius={scale * 30}
        depth={scale * 12}
        count={4000}
        factor={scale * 0.9}
        saturation={0}
        fade
        speed={0.3}
      />
      <Sun size={scale * 0.045} />
      {shown.map((id) => (
        <Line
          key={`orbit-${id}`}
          points={orbits[id]}
          color={active.includes(id) ? PLANETS[id].color : '#3a4258'}
          transparent
          opacity={active.includes(id) ? 0.55 : 0.22}
          lineWidth={active.includes(id) ? 1.4 : 0.8}
        />
      ))}
      {shown.map((id) => (
        <group
          key={id}
          ref={(g) => {
            refs.current[id] = g ?? undefined;
          }}
        >
          <Planet id={id} size={planetSceneSize(id, scale, active.includes(id))} active={active.includes(id)} />
        </group>
      ))}
      {effects && fxSafe && (
        <EffectComposer multisampling={0}>
          <Bloom intensity={1.15} luminanceThreshold={1} mipmapBlur />
        </EffectComposer>
      )}
      <OrbitControls
        makeDefault
        enableDamping={false}
        minDistance={scale * 0.12}
        maxDistance={scale * 9}
      />
    </>
  );
}

export default function TimeLapsePanel({
  departPlanet,
  arrivePlanet,
  startMs,
  grid,
  onClose,
}: Props) {
  const spanDays = Math.min(3200, Math.max(300, Math.round(synodicDays(departPlanet, arrivePlanet))));

  const data = useMemo(() => {
    const maxActiveAu = Math.max(
      PLANETS[departPlanet].semiMajorAxisAu,
      PLANETS[arrivePlanet].semiMajorAxisAu,
    );
    const shown = PLANET_IDS.filter(
      (id) =>
        id === departPlanet || id === arrivePlanet || PLANETS[id].semiMajorAxisAu < maxActiveAu * 2.2,
    );
    const pathsKm = {} as Record<PlanetId, Vec3[]>;
    const paths = {} as Record<PlanetId, [number, number, number][]>;
    const orbits = {} as Record<PlanetId, [number, number, number][]>;
    for (const id of shown) {
      const pts: Vec3[] = [];
      for (let i = 0; i <= SAMPLES; i++) {
        pts.push(planetState(id, startMs + ((spanDays * DAY_MS) * i) / SAMPLES).r);
      }
      pathsKm[id] = pts;
      paths[id] = pts.map(toScene);
      orbits[id] = orbitLoop(id, startMs).map(toScene);
    }
    return { shown, pathsKm, paths, orbits, scale: maxActiveAu * 1.1 };
  }, [departPlanet, arrivePlanet, startMs, spanDays]);

  // ideal departure phase angle for a Hohmann-like transfer
  const idealPhaseDeg = useMemo(() => {
    const tH = hohmannTofDays(departPlanet, arrivePlanet);
    let d = 180 - (360 * tH) / (PLANETS[arrivePlanet].periodYears * 365.25);
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return d;
  }, [departPlanet, arrivePlanet]);

  // min Δv per departure date, from the current grid
  const strip = useMemo(() => {
    if (!grid || !grid.min) return null;
    const nDep = grid.departDatesMs.length;
    const pts: { ms: number; dv: number }[] = [];
    for (let iDep = 0; iDep < nDep; iDep++) {
      let best = Infinity;
      for (let iArr = 0; iArr < grid.arriveDatesMs.length; iArr++) {
        const v = grid.totalDv[iArr * nDep + iDep];
        if (Number.isFinite(v) && v < best) best = v;
      }
      if (Number.isFinite(best)) pts.push({ ms: grid.departDatesMs[iDep], dv: best });
    }
    if (pts.length < 4) return null;
    const dvs = pts.map((p) => p.dv).sort((a, b) => a - b);
    const lo = dvs[0];
    const hi = Math.max(dvs[Math.floor(dvs.length * 0.85)], lo * 1.2);
    return { pts, lo, hi };
  }, [grid]);

  const progressRef = useRef({ t: 0 });
  const tweenRef = useRef<gsap.core.Tween | null>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const scrubbing = useRef(false);
  const dateRef = useRef<HTMLSpanElement>(null);
  const phaseRef = useRef<HTMLSpanElement>(null);
  const distRef = useRef<HTMLSpanElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);
  const cursorRef = useRef<SVGLineElement>(null);

  const startTween = (fromT: number, spd: number) => {
    tweenRef.current?.kill();
    progressRef.current.t = fromT;
    tweenRef.current = gsap.to(progressRef.current, {
      t: 1,
      duration: (18 * (1 - fromT)) / spd,
      ease: 'none',
      repeat: -1,
      onRepeat: () => {
        progressRef.current.t = 0;
      },
    });
  };

  useEffect(() => {
    startTween(0, speed);
    return () => {
      tweenRef.current?.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departPlanet, arrivePlanet, startMs]);

  // readouts without React re-renders
  useEffect(() => {
    let raf = 0;
    const AUkm = 149_597_870.7;
    const loop = () => {
      const t = progressRef.current.t;
      const ms = startMs + spanDays * DAY_MS * t;
      const pd = lerpKm(data.pathsKm[departPlanet], t);
      const pa = lerpKm(data.pathsKm[arrivePlanet], t);
      const phase = phaseAngleDeg(pd, pa);
      const nearWindow = Math.abs(phase - idealPhaseDeg) < 6;
      if (dateRef.current) {
        dateRef.current.textContent = fmtDate(ms);
        dateRef.current.style.color = nearWindow ? '#ffb347' : '#3ab0ff';
      }
      if (phaseRef.current) {
        phaseRef.current.textContent = `${phase.toFixed(1)}°`;
        phaseRef.current.style.color = nearWindow ? '#ffb347' : '#e8ecf4';
      }
      if (distRef.current) {
        const d = Math.hypot(pd[0] - pa[0], pd[1] - pa[1], pd[2] - pa[2]) / AUkm;
        distRef.current.textContent = `${d.toFixed(2)} AU`;
      }
      if (sliderRef.current && !scrubbing.current)
        sliderRef.current.value = String(Math.round(t * 1000));
      if (cursorRef.current) cursorRef.current.setAttribute('x1', String(t * 100));
      if (cursorRef.current) cursorRef.current.setAttribute('x2', String(t * 100));
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [data, departPlanet, arrivePlanet, startMs, spanDays, idealPhaseDeg]);

  const togglePlay = () => {
    if (playing) {
      tweenRef.current?.pause();
    } else {
      startTween(progressRef.current.t, speed);
    }
    setPlaying(!playing);
  };

  const cycleSpeed = () => {
    const next = speed === 1 ? 2 : speed === 2 ? 4 : 1;
    setSpeed(next);
    if (playing) startTween(progressRef.current.t, next);
  };

  const stripPath = useMemo(() => {
    if (!strip) return '';
    const endMs = startMs + spanDays * DAY_MS;
    return strip.pts
      .filter((p) => p.ms >= startMs && p.ms <= endMs)
      .map((p, i) => {
        const x = ((p.ms - startMs) / (endMs - startMs)) * 100;
        const y = 100 - Math.min(1, Math.max(0, (p.dv - strip.lo) / (strip.hi - strip.lo))) * 92 - 4;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  }, [strip, startMs, spanDays]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="flex h-full flex-col overflow-hidden rounded-md border border-grid-line bg-void"
    >
      <div className="flex items-center justify-between border-b border-grid-line bg-panel px-4 py-2">
        <div className="font-mono text-[11px] tracking-[0.2em] text-text-mid uppercase">
          Time-lapse · one synodic period ·{' '}
          <span style={{ color: PLANETS[departPlanet].color }}>{departPlanet}</span> /{' '}
          <span style={{ color: PLANETS[arrivePlanet].color }}>{arrivePlanet}</span>{' '}
          <span className="text-text-lo">({spanDays} days)</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-grid-line p-1.5 text-text-mid transition-colors hover:border-danger/60 hover:text-danger"
          title="Close time-lapse"
        >
          <X size={14} />
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        <SafeCanvas
          camera={{
            fov: 42,
            near: 0.005,
            far: 500,
            position: [data.scale * 0.15, data.scale * 2.3, data.scale * 1.35],
          }}
        >
          {(effects) => (
            <LapseScene
              shown={data.shown}
              active={[departPlanet, arrivePlanet]}
              paths={data.paths}
              orbits={data.orbits}
              scale={data.scale}
              progress={progressRef.current}
              effects={effects}
            />
          )}
        </SafeCanvas>

        {/* HUD */}
        <div className="pointer-events-none absolute right-0 bottom-0 left-0 border-t border-grid-line/60 bg-void/80 px-4 pt-2 pb-2.5 backdrop-blur-sm">
          {/* Δv strip */}
          {strip && (
            <div className="mb-1.5">
              <svg viewBox="0 0 100 16" preserveAspectRatio="none" className="h-9 w-full">
                <path
                  d={stripPath}
                  fill="none"
                  stroke="#3ab0ff"
                  strokeWidth={0.6}
                  vectorEffect="non-scaling-stroke"
                  transform="scale(1,0.16)"
                />
                <line
                  ref={cursorRef}
                  x1={0}
                  x2={0}
                  y1={0}
                  y2={16}
                  stroke="#ffb347"
                  strokeWidth={0.5}
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <div className="flex justify-between font-mono text-[8.5px] text-text-lo">
                <span>min Δv per departure date — dips are launch windows</span>
                <span>
                  {fmtNum(strip.lo, 1)}–{fmtNum(strip.hi, 1)} km/s
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={togglePlay}
              className="pointer-events-auto rounded border border-accent/50 bg-accent/10 p-1.5 text-accent transition-colors hover:bg-accent/20"
              title={playing ? 'Pause' : 'Play'}
            >
              {playing ? <Pause size={13} /> : <Play size={13} />}
            </button>
            <button
              type="button"
              onClick={cycleSpeed}
              className="pointer-events-auto rounded border border-grid-line px-2 py-1 font-mono text-[10px] text-text-mid transition-colors hover:border-accent-dim hover:text-accent"
              title="Playback speed"
            >
              {speed}×
            </button>
            <input
              ref={sliderRef}
              type="range"
              min={0}
              max={1000}
              defaultValue={0}
              onPointerDown={() => {
                scrubbing.current = true;
                tweenRef.current?.pause();
              }}
              onPointerUp={() => {
                scrubbing.current = false;
                if (playing) startTween(progressRef.current.t, speed);
              }}
              onInput={(e) => {
                progressRef.current.t = Number((e.target as HTMLInputElement).value) / 1000;
              }}
              className="pointer-events-auto h-1 flex-1 cursor-pointer appearance-none rounded bg-grid-line accent-[#3ab0ff]"
            />
            <span ref={dateRef} className="w-28 text-right font-mono text-[11px] text-accent" />
            <span className="hidden font-mono text-[10px] text-text-lo lg:inline">phase</span>
            <span ref={phaseRef} className="hidden w-14 text-right font-mono text-[11px] lg:inline" />
            <span className="hidden font-mono text-[10px] text-text-lo lg:inline">
              (ideal {idealPhaseDeg.toFixed(0)}°)
            </span>
            <span className="hidden font-mono text-[10px] text-text-lo md:inline">dist</span>
            <span ref={distRef} className="hidden w-16 text-right font-mono text-[11px] text-text-hi md:inline" />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
