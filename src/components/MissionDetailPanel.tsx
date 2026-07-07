import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Box, Lock, X } from 'lucide-react';
import { arrivalTradeTable, type Mission } from '../lib/mission';
import { PLANETS } from '../lib/orbitalConstants';
import { fmtDate, fmtNum } from '../lib/format';
import TrajectoryDiagram2D from './TrajectoryDiagram2D';

interface Props {
  mission: Mission;
  aerocapture: boolean;
  show3D: boolean;
  onToggle3D: () => void;
  onClear: () => void;
}

function BurnBar({
  label,
  value,
  total,
  color,
  note,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
  note: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between font-mono text-[11px]">
        <span className="text-text-lo">{label}</span>
        <span className="text-text-hi">{fmtNum(value)} km/s</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded bg-grid-line">
        <motion.div
          className="h-full rounded"
          style={{ background: color, boxShadow: `0 0 8px ${color}` }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, (value / total) * 100)}%` }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        />
      </div>
      <div className="mt-0.5 text-[10px] text-text-lo">{note}</div>
    </div>
  );
}

export default function MissionDetailPanel({
  mission,
  aerocapture,
  show3D,
  onToggle3D,
  onClear,
}: Props) {
  const dep = PLANETS[mission.departPlanet];
  const arr = PLANETS[mission.arrivePlanet];
  const trade = useMemo(() => arrivalTradeTable(mission, aerocapture), [mission, aerocapture]);
  const captureNote =
    mission.dvCapture === 0
      ? 'aerocapture — atmosphere brakes for free'
      : arr.captureApoRatio > 1
        ? `capture to high-ellipse orbit (${arr.parkingAltKm} km × ${arr.captureApoRatio}×rp)`
        : `capture to ${arr.parkingAltKm} km circular orbit`;

  return (
    <motion.section
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      className="rounded-md border border-accent/30 bg-panel px-3 py-2.5"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] tracking-[0.14em] text-accent uppercase">
          <Lock size={12} /> Locked window
        </div>
        <button
          type="button"
          onClick={onClear}
          title="Clear locked window"
          className="rounded p-1 text-text-lo transition-colors hover:text-danger"
        >
          <X size={12} />
        </button>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px]">
        <span className="text-text-lo">depart</span>
        <span className="text-right text-text-hi">{fmtDate(mission.departMs)}</span>
        <span className="text-text-lo">arrive</span>
        <span className="text-right text-text-hi">{fmtDate(mission.arriveMs)}</span>
        <span className="text-text-lo">flight time</span>
        <span className="text-right text-text-hi">{Math.round(mission.tofDays)} days</span>
        <span className="text-text-lo">C3</span>
        <span className="text-right text-text-hi">{fmtNum(mission.depC3, 1)} km²/s²</span>
        <span className="text-text-lo">v∞ arrival</span>
        <span className="text-right text-text-hi">{fmtNum(mission.arrVinf)} km/s</span>
      </div>

      <div className="mt-2 rounded border border-grid-line/70 bg-void/40 p-1">
        <TrajectoryDiagram2D mission={mission} />
      </div>

      <div className="mt-3 flex flex-col gap-2.5">
        <BurnBar
          label="departure burn"
          value={mission.dvDepart}
          total={mission.dvTotal}
          color="#3ab0ff"
          note={`escape from ${dep.parkingAltKm} km ${mission.departPlanet} orbit`}
        />
        <BurnBar
          label="capture burn"
          value={mission.dvCapture}
          total={mission.dvTotal}
          color="#ffb347"
          note={captureNote}
        />
        <div className="flex items-baseline justify-between border-t border-grid-line pt-1.5 font-mono text-[12px]">
          <span className="text-text-mid">TOTAL Δv</span>
          <span className="font-medium text-amber">{fmtNum(mission.dvTotal)} km/s</span>
        </div>
      </div>

      {trade.length > 1 && (
        <div className="mt-3">
          <div className="text-[10px] tracking-[0.14em] text-text-lo uppercase">
            arrival trade — C3 vs v∞
          </div>
          <table className="mt-1 w-full font-mono text-[10px]">
            <thead>
              <tr className="text-left text-text-lo">
                <th className="font-normal">arrive</th>
                <th className="text-right font-normal">C3</th>
                <th className="text-right font-normal">v∞</th>
                <th className="text-right font-normal">Δv</th>
              </tr>
            </thead>
            <tbody>
              {trade.map((t) => (
                <tr
                  key={t.offsetDays}
                  className={`border-t border-grid-line/40 ${
                    t.offsetDays === 0 ? 'text-accent' : 'text-text-hi'
                  }`}
                >
                  <td className="py-0.5">
                    {t.offsetDays === 0 ? '● ' : ''}
                    {t.offsetDays > 0 ? `+${t.offsetDays}d` : t.offsetDays < 0 ? `${t.offsetDays}d` : 'locked'}
                  </td>
                  <td className="py-0.5 text-right">{fmtNum(t.depC3, 1)}</td>
                  <td className="py-0.5 text-right">{fmtNum(t.arrVinf, 2)}</td>
                  <td className="py-0.5 text-right">{fmtNum(t.dvTotal, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button
        type="button"
        onClick={onToggle3D}
        className={`mt-3 flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 font-mono text-[11px] tracking-[0.2em] uppercase transition-all ${
          show3D
            ? 'border-grid-line text-text-mid hover:border-accent-dim'
            : 'animate-pulse border-accent/60 bg-accent/10 text-accent hover:bg-accent/20'
        }`}
      >
        <Box size={13} />
        {show3D ? 'Close 3D trajectory' : 'Open 3D trajectory'}
      </button>
    </motion.section>
  );
}
