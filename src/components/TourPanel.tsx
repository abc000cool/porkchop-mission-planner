import { CheckCircle2, FileText, Flame, Gauge } from 'lucide-react';
import type { TourEvaluation } from '../lib/tour';
import { PLANETS } from '../lib/orbitalConstants';
import { fmtDate, fmtNum } from '../lib/format';

interface Props {
  evaluation: TourEvaluation | null;
  /** False while the 3D mission is still assembling (report needs its geometry). */
  canExport: boolean;
  onExportPdf: () => void;
}

export default function TourPanel({ evaluation, canExport, onExportPdf }: Props) {
  if (!evaluation) {
    return (
      <div className="rounded-md border border-dashed border-grid-line px-3 py-6 text-center font-mono text-[11px] leading-relaxed text-text-lo">
        no feasible trajectory —<br />
        adjust leg flight times
      </div>
    );
  }
  const ev = evaluation;

  return (
    <>
      {/* totals */}
      <section className="rounded-md border border-amber-dim/70 bg-amber/[0.04] px-3 py-2.5">
        <div className="flex items-center gap-2 text-[11px] tracking-[0.14em] text-amber uppercase">
          <Gauge size={12} /> Tour budget
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px]">
          <span className="text-text-lo">launch C3</span>
          <span className="text-right text-text-hi">{fmtNum(ev.depC3, 1)} km²/s²</span>
          <span className="text-text-lo">departure burn</span>
          <span className="text-right text-text-hi">{fmtNum(ev.dvDepart)} km/s</span>
          <span className="text-text-lo">flyby penalties</span>
          <span className={`text-right ${ev.dvFlybys < 0.2 ? 'text-ok' : 'text-text-hi'}`}>
            {fmtNum(ev.dvFlybys)} km/s
          </span>
          <span className="text-text-lo">
            {ev.finish === 'flyby'
              ? 'finish (flyby)'
              : ev.finish === 'aerocapture'
                ? 'capture (aero)'
                : 'capture burn'}
          </span>
          <span className={`text-right ${ev.dvCapture === 0 ? 'text-ok' : 'text-text-hi'}`}>
            {ev.finish === 'flyby' ? 'no capture' : `${fmtNum(ev.dvCapture)} km/s`}
          </span>
          <span className="text-text-lo">total Δv</span>
          <span className="text-right font-medium text-amber">{fmtNum(ev.dvTotal)} km/s</span>
          <span className="text-text-lo">total flight</span>
          <span className="text-right text-text-hi">
            {Math.round(ev.totalTofDays).toLocaleString()} d ·{' '}
            {(ev.totalTofDays / 365.25).toFixed(1)} yr
          </span>
        </div>
      </section>

      {/* legs */}
      <section className="rounded-md border border-grid-line bg-panel px-3 py-2.5">
        <div className="text-[11px] tracking-[0.14em] text-text-mid uppercase">Legs</div>
        <table className="mt-1.5 w-full font-mono text-[10px]">
          <thead>
            <tr className="text-left text-text-lo">
              <th className="pb-1 font-normal">leg</th>
              <th className="pb-1 font-normal">depart</th>
              <th className="pb-1 text-right font-normal">TOF</th>
            </tr>
          </thead>
          <tbody>
            {ev.legs.map((leg, i) => (
              <tr key={i} className="border-t border-grid-line/50 text-text-hi">
                <td className="py-1">
                  <span style={{ color: PLANETS[leg.from].color }}>{leg.from.slice(0, 3)}</span>
                  <span className="text-text-lo">→</span>
                  <span style={{ color: PLANETS[leg.to].color }}>{leg.to.slice(0, 3)}</span>
                </td>
                <td className="py-1">{fmtDate(leg.departMs)}</td>
                <td className="py-1 text-right">{Math.round(leg.tofDays)}d</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* flybys */}
      {ev.flybys.length > 0 && (
        <section className="rounded-md border border-grid-line bg-panel px-3 py-2.5">
          <div className="flex items-center gap-2 text-[11px] tracking-[0.14em] text-text-mid uppercase">
            <Flame size={12} className="text-accent" /> Gravity assists
          </div>
          <div className="mt-1.5 flex flex-col gap-2">
            {ev.flybys.map((fb, i) => (
              <div key={i} className="rounded border border-grid-line/60 bg-panel-2/50 px-2 py-1.5">
                <div className="flex items-center justify-between font-mono text-[10.5px]">
                  <span style={{ color: PLANETS[fb.planet].color }}>{fb.planet}</span>
                  <span className="text-text-lo">{fmtDate(fb.ms)}</span>
                </div>
                <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 font-mono text-[9.5px]">
                  <span className="text-text-lo">v∞ in / out</span>
                  <span className="text-right text-text-hi">
                    {fmtNum(fb.vinfIn, 1)} / {fmtNum(fb.vinfOut, 1)} km/s
                  </span>
                  <span className="text-text-lo">turn req / max</span>
                  <span
                    className={`text-right ${fb.turnReqDeg > fb.turnMaxDeg ? 'text-danger' : 'text-text-hi'}`}
                  >
                    {fb.turnReqDeg.toFixed(0)}° / {fb.turnMaxDeg.toFixed(0)}°
                  </span>
                  <span className="text-text-lo">periapsis alt</span>
                  <span className="text-right text-text-hi">
                    {Math.round(fb.altKm).toLocaleString()} km
                  </span>
                  <span className="text-text-lo">assist Δv</span>
                  <span className={`text-right ${fb.ballistic ? 'text-ok' : fb.dv < 0.5 ? 'text-amber' : 'text-danger'}`}>
                    {fb.ballistic ? (
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 size={9} /> ballistic
                      </span>
                    ) : (
                      `${fmtNum(fb.dv)} km/s`
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <button
        type="button"
        onClick={onExportPdf}
        disabled={!canExport}
        title={canExport ? 'Export one-page tour report' : 'assembling tour geometry…'}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-grid-line px-3 py-2 font-mono text-[11px] tracking-[0.2em] text-text-mid uppercase transition-colors hover:border-amber/60 hover:text-amber disabled:cursor-not-allowed disabled:opacity-40"
      >
        <FileText size={13} />
        Export PDF report
      </button>
    </>
  );
}
