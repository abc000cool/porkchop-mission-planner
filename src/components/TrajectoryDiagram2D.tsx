import { useMemo } from 'react';
import type { Mission } from '../lib/mission';
import { PLANETS } from '../lib/orbitalConstants';
import type { Vec3 } from '../lib/vec';

const AU = 149_597_870.7;

/** Top-down (ecliptic) mini map of the locked transfer. */
export default function TrajectoryDiagram2D({ mission }: { mission: Mission }) {
  const S = 240; // viewbox size
  const C = S / 2;

  const geometry = useMemo(() => {
    const depOrbit = mission.orbitLoops[mission.departPlanet] ?? [];
    const arrOrbit = mission.orbitLoops[mission.arrivePlanet] ?? [];
    const all = [...depOrbit, ...arrOrbit, ...mission.trajectory];
    let maxR = 1e-9;
    for (const p of all) maxR = Math.max(maxR, Math.hypot(p[0], p[1]) / AU);
    const k = (C - 14) / maxR;
    const px = (v: Vec3) => [C + (v[0] / AU) * k, C - (v[1] / AU) * k] as const;
    const poly = (pts: Vec3[]) => pts.map((p) => px(p).join(',')).join(' ');
    return {
      depOrbit: poly(depOrbit),
      arrOrbit: poly(arrOrbit),
      transfer: poly(mission.trajectory),
      depPos: px(mission.trajectory[0]),
      arrPos: px(mission.trajectory[mission.trajectory.length - 1]),
      arrGhost: px((mission.planetPaths[mission.arrivePlanet] ?? mission.trajectory)[0]),
    };
  }, [mission]);

  const depColor = PLANETS[mission.departPlanet].color;
  const arrColor = PLANETS[mission.arrivePlanet].color;

  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="w-full">
      <defs>
        <filter id="traj-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* orbits */}
      <polyline points={geometry.depOrbit} fill="none" stroke={depColor} strokeOpacity={0.3} strokeWidth={1} />
      <polyline points={geometry.arrOrbit} fill="none" stroke={arrColor} strokeOpacity={0.3} strokeWidth={1} />

      {/* transfer */}
      <polyline
        points={geometry.transfer}
        fill="none"
        stroke="#3ab0ff"
        strokeWidth={1.8}
        filter="url(#traj-glow)"
      />

      {/* sun */}
      <circle cx={C} cy={C} r={4} fill="#ffb347" filter="url(#traj-glow)" />

      {/* ghost: arrival planet at departure */}
      <circle
        cx={geometry.arrGhost[0]}
        cy={geometry.arrGhost[1]}
        r={3.4}
        fill="none"
        stroke={arrColor}
        strokeOpacity={0.5}
        strokeDasharray="2 2"
      />

      {/* endpoints */}
      <circle cx={geometry.depPos[0]} cy={geometry.depPos[1]} r={4} fill={depColor} />
      <circle cx={geometry.arrPos[0]} cy={geometry.arrPos[1]} r={4} fill={arrColor} />

      <text
        x={geometry.depPos[0] + 7}
        y={geometry.depPos[1] + 3}
        className="fill-text-mid font-mono text-[8px]"
      >
        DEP
      </text>
      <text
        x={geometry.arrPos[0] + 7}
        y={geometry.arrPos[1] + 3}
        className="fill-text-mid font-mono text-[8px]"
      >
        ARR
      </text>
    </svg>
  );
}
