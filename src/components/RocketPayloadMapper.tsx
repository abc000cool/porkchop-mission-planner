import { useMemo } from 'react';
import { Rocket } from 'lucide-react';
import { payloadForC3, ROCKETS, ROCKET_BY_ID } from '../lib/rocketData';
import { fmtInt, fmtNum } from '../lib/format';

interface Props {
  rocketId: string;
  onRocketId: (id: string) => void;
  /** C3 of the current mission (locked window, else grid optimum). */
  c3: number | null;
  c3Source: 'locked' | 'optimal' | null;
}

const W = 250;
const H = 110;
const ML = 34;
const MB = 18;

export default function RocketPayloadMapper({ rocketId, onRocketId, c3, c3Source }: Props) {
  const rocket = ROCKET_BY_ID[rocketId] ?? ROCKETS[1];
  const maxC3 = rocket.curve[rocket.curve.length - 1][0];
  const maxKg = rocket.curve[0][1];

  const chart = useMemo(() => {
    const x = (c: number) => ML + (c / maxC3) * (W - ML - 6);
    const y = (kg: number) => 6 + (1 - kg / maxKg) * (H - MB - 6);
    const pts = rocket.curve.map(([c, kg]) => `${x(c)},${y(kg)}`).join(' ');
    const area = `${ML},${y(0)} ${pts} ${x(maxC3)},${y(0)}`;
    return { x, y, pts, area };
  }, [rocket, maxC3, maxKg]);

  const payload = c3 !== null ? payloadForC3(rocket, c3) : null;

  return (
    <section className="rounded-md border border-grid-line bg-panel px-3 py-2.5">
      <div className="flex items-center gap-2 text-[11px] tracking-[0.14em] text-text-mid uppercase">
        <Rocket size={12} className="text-accent" /> Launch vehicle payload
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {ROCKETS.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onRocketId(r.id)}
            className={`rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-wider transition-colors ${
              r.id === rocket.id
                ? 'border-accent/70 bg-accent/10 text-accent'
                : 'border-grid-line text-text-lo hover:border-accent-dim hover:text-text-mid'
            }`}
            title={r.name}
          >
            {r.short}
          </button>
        ))}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full">
        <polygon points={chart.area} fill={rocket.color} opacity={0.08} />
        <polyline points={chart.pts} fill="none" stroke={rocket.color} strokeWidth={1.6} />
        {/* axes */}
        <line x1={ML} y1={6} x2={ML} y2={H - MB} stroke="#1c1c2a" />
        <line x1={ML} y1={H - MB} x2={W - 6} y2={H - MB} stroke="#1c1c2a" />
        <text x={ML - 4} y={12} textAnchor="end" className="fill-text-lo font-mono text-[7.5px]">
          {fmtInt(maxKg / 1000)}t
        </text>
        <text x={ML - 4} y={H - MB + 3} textAnchor="end" className="fill-text-lo font-mono text-[7.5px]">
          0
        </text>
        <text x={W - 6} y={H - 6} textAnchor="end" className="fill-text-lo font-mono text-[7.5px]">
          C3 {maxC3} km²/s²
        </text>
        {/* mission C3 marker */}
        {c3 !== null && c3 <= maxC3 && (
          <g>
            <line
              x1={chart.x(c3)}
              y1={6}
              x2={chart.x(c3)}
              y2={H - MB}
              stroke="#ffb347"
              strokeDasharray="3 2"
              strokeWidth={1}
            />
            {payload !== null && (
              <circle cx={chart.x(c3)} cy={chart.y(payload)} r={3} fill="#ffb347" />
            )}
          </g>
        )}
      </svg>

      <div className="mt-1 font-mono text-[11px]">
        {c3 === null ? (
          <span className="text-text-lo">no mission selected</span>
        ) : payload === null ? (
          <span className="text-danger">
            C3 {fmtNum(c3, 1)} exceeds {rocket.short} capability ({maxC3} km²/s²)
          </span>
        ) : (
          <span className="text-text-hi">
            <span className="text-text-lo">
              inject @ C3 {fmtNum(c3, 1)} ({c3Source === 'locked' ? 'locked' : 'optimal'}):
            </span>{' '}
            <span className="font-medium text-amber">{fmtInt(payload)} kg</span>
          </span>
        )}
      </div>
      <div className="mt-1 text-[10px] leading-snug text-text-lo">
        {rocket.note} — representative values, not authoritative
      </div>
    </section>
  );
}
