import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Line, OrbitControls, Stars, Trail } from '@react-three/drei';
import type { Line2 } from 'three-stdlib';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { motion } from 'framer-motion';
import gsap from 'gsap';
import { RotateCcw, X } from 'lucide-react';
import type { Mission } from '../lib/mission';
import { PLANETS, type PlanetId } from '../lib/orbitalConstants';
import { fmtDate, fmtNum } from '../lib/format';
import {
  Planet,
  planetSceneSize,
  SafeCanvas,
  samplePath,
  Sun,
  sunSceneSize,
  toScene,
  useFxSafe,
} from './three/shared';

interface Props {
  mission: Mission;
  onClose: () => void;
}

function Scene({
  mission,
  progress,
  effects,
}: {
  mission: Mission;
  effects: boolean;
  progress: { t: number };
}) {
  const { camera } = useThree();
  const fxSafe = useFxSafe();

  const routePlanets = mission.routePlanets ?? [mission.departPlanet, mission.arrivePlanet];
  const maxActiveAu = Math.max(...routePlanets.map((p) => PLANETS[p].semiMajorAxisAu));
  const scale = maxActiveAu * 1.1;

  const shownPlanets = mission.planetIds;

  const trajScene = useMemo(() => mission.trajectory.map(toScene), [mission]);
  const pathsScene = useMemo(() => {
    const out = {} as Record<PlanetId, [number, number, number][]>;
    for (const id of shownPlanets) out[id] = (mission.planetPaths[id] ?? []).map(toScene);
    return out;
  }, [mission, shownPlanets]);
  const orbitsScene = useMemo(() => {
    const out = {} as Record<PlanetId, [number, number, number][]>;
    for (const id of shownPlanets) out[id] = (mission.orbitLoops[id] ?? []).map(toScene);
    return out;
  }, [mission, shownPlanets]);

  const pathLen = useMemo(() => {
    let L = 0;
    for (let i = 1; i < trajScene.length; i++) {
      const a = trajScene[i - 1];
      const b = trajScene[i];
      L += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    }
    return L;
  }, [trajScene]);

  const lineRef = useRef<Line2>(null);
  const craftRef = useRef<THREE.Group>(null);
  const planetRefs = useRef<Partial<Record<PlanetId, THREE.Group>>>({});

  // cinematic fly-in
  useEffect(() => {
    camera.position.set(scale * 0.02, scale * 3.6, scale * 0.05);
    const tween = gsap.to(camera.position, {
      x: scale * 1.25,
      y: scale * 1.05,
      z: scale * 1.35,
      duration: 2.0,
      ease: 'power2.inOut',
    });
    return () => {
      tween.kill();
    };
  }, [camera, scale, mission]);

  useFrame(() => {
    const t = progress.t;
    if (craftRef.current) craftRef.current.position.set(...samplePath(trajScene, t));
    for (const id of shownPlanets) {
      const g = planetRefs.current[id];
      if (g) g.position.set(...samplePath(pathsScene[id], t));
    }
    const mat = lineRef.current?.material;
    if (mat) {
      mat.dashOffset = pathLen * (1 - t);
    }
  });

  return (
    <>
      <ambientLight intensity={0.12} />
      <pointLight position={[0, 0, 0]} intensity={3.2} decay={0} color="#fff2dd" />
      <Stars
        radius={scale * 30}
        depth={scale * 12}
        count={5000}
        factor={scale * 0.9}
        saturation={0}
        fade
        speed={0.3}
      />

      <Sun size={sunSceneSize(scale)} sceneScale={scale} />

      {/* orbit lines */}
      {shownPlanets.map((id) => {
        const active = routePlanets.includes(id);
        return (
          <Line
            key={`orbit-${id}`}
            points={orbitsScene[id]}
            color={active ? PLANETS[id].color : '#3a4258'}
            transparent
            opacity={active ? 0.55 : 0.22}
            lineWidth={active ? 1.4 : 0.8}
          />
        );
      })}

      {/* planets */}
      {shownPlanets.map((id) => {
        const active = routePlanets.includes(id);
        return (
          <group
            key={id}
            ref={(g) => {
              planetRefs.current[id] = g ?? undefined;
            }}
          >
            <Planet id={id} size={planetSceneSize(id, scale, active)} active={active} />
          </group>
        );
      })}

      {/* ghost: arrival planet position at departure epoch */}
      <mesh position={samplePath(pathsScene[mission.arrivePlanet], 0)}>
        <sphereGeometry
          args={[planetSceneSize(mission.arrivePlanet, scale, true) * 0.9, 20, 20]}
        />
        <meshBasicMaterial
          color={PLANETS[mission.arrivePlanet].color}
          wireframe
          transparent
          opacity={0.18}
        />
      </mesh>

      {/* transfer trajectory: draw-on via dash offset */}
      <Line
        ref={lineRef}
        points={trajScene}
        color={new THREE.Color(0.25, 1.35, 2.8)}
        toneMapped={false}
        lineWidth={2.2}
        dashed
        dashSize={pathLen}
        gapSize={pathLen}
        dashOffset={pathLen}
      />

      {/* spacecraft */}
      <group ref={craftRef}>
        <Trail
          width={scale * 0.35}
          length={5}
          color={new THREE.Color(0.15, 0.65, 1.4)}
          attenuation={(t) => t * t}
        >
          <mesh>
            <sphereGeometry args={[scale * 0.008, 16, 16]} />
            <meshBasicMaterial color={[1.2, 3.2, 6]} toneMapped={false} />
          </mesh>
        </Trail>
      </group>

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

export default function SolarSystem3D({ mission, onClose }: Props) {
  const progressRef = useRef({ t: 0 });
  const tweenRef = useRef<gsap.core.Tween | null>(null);
  const dateRef = useRef<HTMLSpanElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);
  const scrubbing = useRef(false);

  const routePlanets = mission.routePlanets ?? [mission.departPlanet, mission.arrivePlanet];

  const play = () => {
    tweenRef.current?.kill();
    progressRef.current.t = 0;
    tweenRef.current = gsap.to(progressRef.current, {
      t: 1,
      duration: routePlanets.length > 2 ? 6 : 3.4,
      delay: 0.7,
      ease: routePlanets.length > 2 ? 'none' : 'power1.inOut',
    });
  };

  useEffect(() => {
    play();
    return () => {
      tweenRef.current?.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mission]);

  // HUD readouts follow the tween without React re-renders
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const t = progressRef.current.t;
      const ms = mission.departMs + (mission.arriveMs - mission.departMs) * t;
      if (dateRef.current) dateRef.current.textContent = `T ${fmtDate(ms)}`;
      if (sliderRef.current && !scrubbing.current)
        sliderRef.current.value = String(Math.round(t * 1000));
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [mission]);

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
          {routePlanets.length > 2 ? 'Grand tour' : 'Transfer trajectory'} ·{' '}
          {routePlanets.map((p, i) => (
            <span key={`${p}-${i}`}>
              {i > 0 && ' → '}
              <span style={{ color: PLANETS[p].color }}>{p}</span>
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-grid-line p-1.5 text-text-mid transition-colors hover:border-danger/60 hover:text-danger"
          title="Close 3D view"
        >
          <X size={14} />
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        <SafeCanvas>
          {(effects) => (
            <Scene mission={mission} progress={progressRef.current} effects={effects} />
          )}
        </SafeCanvas>

        {/* HUD */}
        <div className="pointer-events-none absolute right-0 bottom-0 left-0 flex items-center gap-3 border-t border-grid-line/60 bg-void/75 px-4 py-2.5 backdrop-blur-sm">
          <button
            type="button"
            onClick={play}
            className="pointer-events-auto rounded border border-accent/50 bg-accent/10 p-1.5 text-accent transition-colors hover:bg-accent/20"
            title="Replay"
          >
            <RotateCcw size={13} />
          </button>
          <input
            ref={sliderRef}
            type="range"
            min={0}
            max={1000}
            defaultValue={0}
            onPointerDown={() => {
              scrubbing.current = true;
              tweenRef.current?.kill();
            }}
            onPointerUp={() => {
              scrubbing.current = false;
            }}
            onInput={(e) => {
              progressRef.current.t = Number((e.target as HTMLInputElement).value) / 1000;
            }}
            className="pointer-events-auto h-1 flex-1 cursor-pointer appearance-none rounded bg-grid-line accent-[#3ab0ff]"
          />
          <span ref={dateRef} className="w-36 font-mono text-[11px] text-accent" />
          <span className="hidden font-mono text-[11px] text-text-mid sm:inline">
            TOF {Math.round(mission.tofDays)} d
          </span>
          <span className="hidden font-mono text-[11px] text-amber sm:inline">
            Δv {fmtNum(mission.dvTotal)} km/s
          </span>
        </div>
      </div>
    </motion.div>
  );
}
