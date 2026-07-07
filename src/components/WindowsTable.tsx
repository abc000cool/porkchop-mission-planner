import { CalendarRange } from 'lucide-react';
import type { GridMinimum } from '../lib/porkchop';
import { fmtDate, fmtNum } from '../lib/format';

interface Props {
  windows: GridMinimum[];
  lockedDepartMs: number | null;
  lockedArriveMs: number | null;
  onSelect: (w: GridMinimum) => void;
}

export default function WindowsTable({ windows, lockedDepartMs, lockedArriveMs, onSelect }: Props) {
  if (windows.length === 0) return null;
  return (
    <section className="rounded-md border border-grid-line bg-panel px-3 py-2.5">
      <div className="flex items-center gap-2 text-[11px] tracking-[0.14em] text-text-mid uppercase">
        <CalendarRange size={12} className="text-accent" /> Best launch windows
      </div>
      <table className="mt-2 w-full font-mono text-[10.5px]">
        <thead>
          <tr className="text-left text-text-lo">
            <th className="pb-1 font-normal">#</th>
            <th className="pb-1 font-normal">depart</th>
            <th className="pb-1 text-right font-normal">TOF</th>
            <th className="pb-1 text-right font-normal">Δv</th>
          </tr>
        </thead>
        <tbody>
          {windows.map((w, i) => {
            const locked = w.departMs === lockedDepartMs && w.arriveMs === lockedArriveMs;
            return (
              <tr
                key={`${w.departMs}-${w.arriveMs}`}
                onClick={() => onSelect(w)}
                title={`arrive ${fmtDate(w.arriveMs)} · C3 ${fmtNum(w.depC3, 1)} km²/s²`}
                className={`cursor-pointer border-t border-grid-line/50 transition-colors ${
                  locked ? 'bg-accent/10 text-accent' : 'text-text-hi hover:bg-accent/5'
                }`}
              >
                <td className={`py-1 ${i === 0 ? 'text-amber' : 'text-text-lo'}`}>{i + 1}</td>
                <td className="py-1">{fmtDate(w.departMs)}</td>
                <td className="py-1 text-right">{Math.round(w.tofDays)}d</td>
                <td className={`py-1 text-right ${i === 0 ? 'text-amber' : ''}`}>
                  {fmtNum(w.totalDv)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-1.5 text-[10px] text-text-lo">click a row to lock it in · km/s</div>
    </section>
  );
}
