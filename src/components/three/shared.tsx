// Shared building blocks for the 3D scenes (transfer view + time-lapse).

import { Component, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, useTexture } from '@react-three/drei';
import { PLANETS, type PlanetId } from '../../lib/orbitalConstants';
import type { Vec3 } from '../../lib/vec';

export const AU = 149_597_870.7;

export const TEXTURES: Record<PlanetId, string> = {
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
export const toScene = (v: Vec3): [number, number, number] => [v[0] / AU, v[2] / AU, -v[1] / AU];

/** Linear interpolation along a scene-space path at fraction t ∈ [0, 1]. */
export function samplePath(path: [number, number, number][], t: number): [number, number, number] {
  const f = Math.min(1, Math.max(0, t)) * (path.length - 1);
  const i = Math.min(path.length - 2, Math.floor(f));
  const u = f - i;
  const a = path[i];
  const b = path[i + 1];
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}

/**
 * postprocessing's EffectComposer dereferences getContextAttributes(), which
 * is null on some drivers/virtual GPUs — probe before enabling bloom.
 */
export function useFxSafe(): boolean {
  const gl = useThree((s) => s.gl);
  return useMemo(() => {
    try {
      return !!gl.getContext().getContextAttributes();
    } catch {
      return false;
    }
  }, [gl]);
}

/**
 * A WebGL failure (context loss, driver quirks with post-processing) must
 * never unmount the whole app.
 */
export class GLBoundary extends Component<
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

/**
 * Canvas wrapper with graceful GPU degradation: bloom effects → plain WebGL
 * → "unavailable" message. Children receive whether effects are allowed.
 */
export function SafeCanvas({
  children,
  camera,
}: {
  children: (effects: boolean) => ReactNode;
  camera?: { fov?: number; near?: number; far?: number; position?: [number, number, number] };
}) {
  // 2 = bloom effects, 1 = plain WebGL, 0 = unavailable on this GPU
  const [tier, setTier] = useState(2);
  if (tier === 0) {
    return (
      <div className="flex h-full items-center justify-center font-mono text-[11px] tracking-[0.2em] text-text-lo">
        3D VIEW UNAVAILABLE ON THIS GPU
      </div>
    );
  }
  return (
    <GLBoundary
      key={tier}
      onError={() => setTier((t) => Math.max(0, t - 1))}
      fallback={
        <div className="flex h-full items-center justify-center font-mono text-[11px] tracking-[0.2em] text-text-lo">
          RESTARTING RENDERER…
        </div>
      }
    >
      <Canvas
        dpr={[1, 1.5]}
        camera={camera ?? { fov: 42, near: 0.005, far: 500 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener('webglcontextlost', (e) => e.preventDefault());
        }}
      >
        <color attach="background" args={['#06060a']} />
        {children(tier === 2)}
      </Canvas>
    </GLBoundary>
  );
}

export function Sun({ size }: { size: number }) {
  return (
    <mesh>
      <sphereGeometry args={[size, 48, 48]} />
      <meshBasicMaterial color={[7, 4.6, 1.7]} toneMapped={false} />
    </mesh>
  );
}

export function SaturnRings({ radius }: { radius: number }) {
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

export function Planet({
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
        <Html center position={[0, size * 2.4, 0]}>
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

/** Planet display radius (not to scale — real scale would be invisible). */
export function planetSceneSize(id: PlanetId, sceneScale: number, active: boolean): number {
  return sceneScale * 0.02 * Math.cbrt(PLANETS[id].radiusKm / 6371) * (active ? 1.25 : 0.8);
}
