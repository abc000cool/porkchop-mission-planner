import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Line, OrbitControls, Stars, Trail, useTexture } from '@react-three/drei';
import type { Line2 } from 'three-stdlib';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { motion } from 'framer-motion';
import gsap from 'gsap';
import { RotateCcw, X } from 'lucide-react';
import type { Mission } from '../lib/mission';
import { PLANETS, type PlanetId } from '../lib/orbitalConstants';
import { fmtDate, fmtNum } from '../lib/format';
import type { Vec3 } from '../lib/vec';

const AU = 149_597_870.7;

const TEXTURES: Record<PlanetId, string> = {
  Mercury: '/textures/2k_mercury.jpg',
  Venus: '/textures/2k_venus_atmosphere.jpg',
  Earth: '/textures/2k_earth_daymap.jpg',
  Mars: '/textures/2k_mars.jpg',
  Jupiter: '/textures/2k_jupiter.jpg',
  Saturn: '/textures/2k_saturn.jpg',
  Uranus: '/textures/2k_uranus.jpg',
  Neptune: '/textures/2k_neptune.jpg',
};

/** Ecliptic J2000 km → three.js scene units (AU, Y-up). */
const toScene = (v: Vec3): [number, number, number] => [v[0] / AU, v[2] / AU, -v[1] / AU];

/** Linear interpolation along a scene-space path at fraction t ∈ [0, 1]. */
function samplePath(path: [number, number, number][], t: number): [number, number, number] {
  const f = Math.min(1, Math.max(0, t)) * (path.length - 1);
  const i = Math.min(path.length - 2, Math.floor(f));
  const u = f - i;
  const a = path[i];
  const b = path[i + 1];
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}

interface SceneShared {
  progress: { t: number };
}

/**
 * A WebGL failure (context loss, driver quirks with post-processing) must
 * never unmount the whole app. First failure retries without effects; a
 * second failure shows a fallback message.
 */
class GLBoundary extends Component<
  { onError: () => void; fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

interface Props {
  mission: Mission;
  onClose: () => void;
}

function Sun({ size }: { size: number }) {
  return (
    <mesh>
      <sphereGeometry args={[size, 48, 48]} />
      <meshBasicMaterial color={[7, 4.6, 1.7]} toneMapped={false} />
    </mesh>
  );
}

function SaturnRings({ radius }: { radius: number }) {
  const tex = useTexture('/textures/2k_saturn_ring_alpha.png');
  const geo = useMemo(() => {
    const inner = radius * 1.35;
    const outer = radius * 2.25;
    const g = new THREE.RingGeometry(inner, outer, 96, 1);
    const pos = g.attributes.position;
    const uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getY(i));
      uv.setXY(i, (r - inner) / (outer - inner), 0.5);
    }
    return g;
  }, [radius]);
  return (
    <mesh geometry={geo} rotation={[-Math.PI / 2 + 0.35, 0, 0]}>
      <meshBasicMaterial map={tex} side={THREE.DoubleSide} transparent opacity={0.85} />
    </mesh>
  );
}

function Planet({
  id,
  size,
  active,
  label,
}: {
  id: PlanetId;
  size: number;
  active: boolean;
  label?: string;
}) {
  const tex = useTexture(TEXTURES[id]);
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (meshRef.current) meshRef.current.rotation.y += dt * 0.15;
  });
  return (
    <group>
      <mesh ref={meshRef}>
        <sphereGeometry args={[size, 40, 40]} />
        <meshStandardMaterial map={tex} roughness={0.9} metalness={0} />
      </mesh>
      {id === 'Saturn' && <SaturnRings radius={size} />}
      {active && (
        <Html center distanceFactor={undefined} position={[0, size * 2.4, 0]}>
          <div
            className="pointer-events-none font-mono text-[10px] tracking-[0.25em] whitespace-nowrap uppercase"
            style={{ color: PLANETS[id].color, textShadow: '0 0 8px rgba(0,0,0,0.9)' }}
          >
            {id}
            {label && <span className="ml-2 text-text-mid normal-case">{label}</span>}
          </div>
        </Html>
      )}
    </group>
  );
}

function Scene({
  mission,
  progress,
  effects,
}: { mission: Mission; effects: boolean } & SceneShared) {
  const { camera } = useThree();

  const maxActiveAu = Math.max(
    PLANETS[mission.departPlanet].semiMajorAxisAu,
    PLANETS[mission.arrivePlanet].semiMajorAxisAu,
  );
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

  const planetSize = (id: PlanetId) =>
    scale * 0.02 * Math.cbrt(PLANETS[id].radiusKm / 6371) * (id === mission.departPlanet || id === mission.arrivePlanet ? 1.25 : 0.8);

  return (
    <>
      <ambientLight intensity={0.12} />
      <pointLight position={[0, 0, 0]} intensity={3.2} decay={0} color="#fff2dd" />
      <Stars radius={scale * 30} depth={scale * 12} count={5000} factor={scale * 0.9} saturation={0} fade speed={0.3} />

      <Sun size={scale * 0.045} />

      {/* orbit lines */}
      {shownPlanets.map((id) => {
        const active = id === mission.departPlanet || id === mission.arrivePlanet;
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
        const active = id === mission.departPlanet || id === mission.arrivePlanet;
        return (
          <group
            key={id}
            ref={(g) => {
              planetRefs.current[id] = g ?? undefined;
            }}
          >
            <Planet id={id} size={planetSize(id)} active={active} />
          </group>
        );
      })}

      {/* ghost: arrival planet position at departure epoch */}
      <mesh position={samplePath(pathsScene[mission.arrivePlanet], 0)}>
        <sphereGeometry args={[planetSize(mission.arrivePlanet) * 0.9, 20, 20]} />
        <meshBasicMaterial color={PLANETS[mission.arrivePlanet].color} wireframe transparent opacity={0.18} />
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
        <Trail width={scale * 0.35} length={5} color={new THREE.Color(0.15, 0.65, 1.4)} attenuation={(t) => t * t}>
          <mesh>
            <sphereGeometry args={[scale * 0.008, 16, 16]} />
            <meshBasicMaterial color={[1.2, 3.2, 6]} toneMapped={false} />
          </mesh>
        </Trail>
      </group>

      {effects && (
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
  // 2 = bloom effects, 1 = plain WebGL, 0 = unavailable on this GPU
  const [glTier, setGlTier] = useState(2);

  const play = () => {
    tweenRef.current?.kill();
    progressRef.current.t = 0;
    tweenRef.current = gsap.to(progressRef.current, {
      t: 1,
      duration: 3.4,
      delay: 0.7,
      ease: 'power1.inOut',
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
      if (sliderRef.current && !scrubbing.current) sliderRef.current.value = String(Math.round(t * 1000));
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
          Transfer trajectory ·{' '}
          <span style={{ color: PLANETS[mission.departPlanet].color }}>
            {mission.departPlanet}
          </span>{' '}
          →{' '}
          <span style={{ color: PLANETS[mission.arrivePlanet].color }}>
            {mission.arrivePlanet}
          </span>
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
        {glTier === 0 ? (
          <div className="flex h-full items-center justify-center font-mono text-[11px] tracking-[0.2em] text-text-lo">
            3D VIEW UNAVAILABLE ON THIS GPU
          </div>
        ) : (
          <GLBoundary
            key={glTier}
            onError={() => setGlTier((t) => Math.max(0, t - 1))}
            fallback={
              <div className="flex h-full items-center justify-center font-mono text-[11px] tracking-[0.2em] text-text-lo">
                RESTARTING RENDERER…
              </div>
            }
          >
            <Canvas
              dpr={[1, 1.5]}
              camera={{ fov: 42, near: 0.005, far: 500 }}
              gl={{ antialias: true, powerPreference: 'high-performance' }}
              onCreated={({ gl }) => {
                gl.domElement.addEventListener('webglcontextlost', (e) => e.preventDefault());
              }}
            >
              <color attach="background" args={['#06060a']} />
              <Scene mission={mission} progress={progressRef.current} effects={glTier === 2} />
            </Canvas>
          </GLBoundary>
        )}

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
