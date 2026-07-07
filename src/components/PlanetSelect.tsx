import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { PLANET_IDS, PLANETS, type PlanetId } from '../lib/orbitalConstants';

interface Props {
  label?: string;
  value: PlanetId;
  exclude?: PlanetId | PlanetId[];
  compact?: boolean;
  onChange: (p: PlanetId) => void;
}

export default function PlanetSelect({ label, value, exclude, compact, onChange }: Props) {
  const excluded = Array.isArray(exclude) ? exclude : exclude ? [exclude] : [];
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const planet = PLANETS[value];

  return (
    <div ref={rootRef} className="relative flex-1">
      {label && (
        <span className="mb-1 block text-[11px] font-medium tracking-[0.14em] text-text-mid uppercase">
          {label}
        </span>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center gap-2 rounded-md border border-grid-line bg-panel-2 text-left transition-colors hover:border-accent-dim focus:border-accent focus:outline-none ${
          compact ? 'px-2 py-1' : 'px-3 py-2'
        }`}
      >
        <span
          className="h-3 w-3 shrink-0 rounded-full"
          style={{ background: planet.color, boxShadow: `0 0 8px ${planet.color}` }}
        />
        <span className={`flex-1 font-medium text-text-hi ${compact ? 'text-xs' : 'text-sm'}`}>
          {planet.id}
        </span>
        <ChevronDown
          size={14}
          className={`text-text-lo transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
            className="absolute z-30 mt-1.5 w-full overflow-hidden rounded-md border border-grid-line bg-panel-2 shadow-[0_12px_32px_rgba(0,0,0,0.6)]"
          >
            {PLANET_IDS.map((id) => {
              const p = PLANETS[id];
              const disabled = excluded.includes(id);
              return (
                <li key={id}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      onChange(id);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
                      disabled
                        ? 'cursor-not-allowed text-text-lo/50'
                        : id === value
                          ? 'bg-accent/10 text-accent'
                          : 'text-text-hi hover:bg-accent/5'
                    }`}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: p.color, opacity: disabled ? 0.3 : 1 }}
                    />
                    {p.id}
                    {disabled && (
                      <span className="ml-auto text-[10px] tracking-wider text-text-lo/60 uppercase">
                        in use
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
