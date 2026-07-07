import { useCallback, useRef } from 'react';
import { DAY_MS } from '../lib/orbitalConstants';
import { isoDate, snapToDay } from '../lib/format';

interface Props {
  label: string;
  minMs: number;
  maxMs: number;
  startMs: number;
  endMs: number;
  minGapDays?: number;
  onChange: (startMs: number, endMs: number) => void;
}

type DragTarget = 'start' | 'end' | 'range';

/** Dual-thumb date range slider with draggable middle band + precise date inputs. */
export default function DualDateSlider({
  label,
  minMs,
  maxMs,
  startMs,
  endMs,
  minGapDays = 20,
  onChange,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ target: DragTarget; grabOffsetMs: number } | null>(null);

  const span = maxMs - minMs;
  const minGap = minGapDays * DAY_MS;
  const pct = (ms: number) => ((ms - minMs) / span) * 100;

  const msAtPointer = useCallback(
    (clientX: number) => {
      const rect = trackRef.current!.getBoundingClientRect();
      const f = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return snapToDay(minMs + f * span);
    },
    [minMs, span],
  );

  const applyDrag = useCallback(
    (clientX: number) => {
      const drag = dragRef.current;
      if (!drag) return;
      const ms = msAtPointer(clientX);
      if (drag.target === 'start') {
        onChange(Math.min(ms, endMs - minGap), endMs);
      } else if (drag.target === 'end') {
        onChange(startMs, Math.max(ms, startMs + minGap));
      } else {
        const width = endMs - startMs;
        let newStart = snapToDay(ms - drag.grabOffsetMs);
        newStart = Math.max(minMs, Math.min(newStart, maxMs - width));
        onChange(newStart, newStart + width);
      }
    },
    [msAtPointer, onChange, startMs, endMs, minGap, minMs, maxMs],
  );

  const beginDrag = (target: DragTarget) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { target, grabOffsetMs: msAtPointer(e.clientX) - startMs };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (dragRef.current) applyDrag(e.clientX);
  };
  const endDrag = () => {
    dragRef.current = null;
  };

  const thumbCls =
    'absolute top-1/2 z-10 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full border-2 border-accent bg-panel shadow-[0_0_8px_rgba(58,176,255,0.7)] transition-shadow hover:shadow-[0_0_14px_rgba(58,176,255,1)]';

  return (
    <div className="select-none">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-medium tracking-[0.14em] text-text-mid uppercase">
          {label}
        </span>
        <div className="flex items-center gap-1 font-mono text-[11px] text-text-hi">
          <input
            type="date"
            value={isoDate(startMs)}
            min={isoDate(minMs)}
            max={isoDate(endMs - minGap)}
            onChange={(e) => {
              const t = Date.parse(e.target.value);
              if (Number.isFinite(t)) onChange(Math.min(t, endMs - minGap), endMs);
            }}
            className="rounded border border-grid-line bg-panel-2 px-1.5 py-0.5 [color-scheme:dark] outline-none focus:border-accent"
          />
          <span className="text-text-lo">→</span>
          <input
            type="date"
            value={isoDate(endMs)}
            min={isoDate(startMs + minGap)}
            max={isoDate(maxMs)}
            onChange={(e) => {
              const t = Date.parse(e.target.value);
              if (Number.isFinite(t)) onChange(startMs, Math.max(t, startMs + minGap));
            }}
            className="rounded border border-grid-line bg-panel-2 px-1.5 py-0.5 [color-scheme:dark] outline-none focus:border-accent"
          />
        </div>
      </div>

      <div
        ref={trackRef}
        className="relative h-7 touch-none"
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* rail */}
        <div className="absolute top-1/2 right-0 left-0 h-[3px] -translate-y-1/2 rounded bg-grid-line" />
        {/* active range */}
        <div
          className="absolute top-1/2 h-[5px] -translate-y-1/2 cursor-grab rounded bg-accent/60 shadow-[0_0_10px_rgba(58,176,255,0.35)] active:cursor-grabbing"
          style={{ left: `${pct(startMs)}%`, width: `${pct(endMs) - pct(startMs)}%` }}
          onPointerDown={beginDrag('range')}
        />
        <div
          className={thumbCls}
          style={{ left: `${pct(startMs)}%` }}
          onPointerDown={beginDrag('start')}
        />
        <div
          className={thumbCls}
          style={{ left: `${pct(endMs)}%` }}
          onPointerDown={beginDrag('end')}
        />
      </div>
    </div>
  );
}
