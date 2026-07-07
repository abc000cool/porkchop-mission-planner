// Shareable mission state via URL query params.

import { isoDate } from './format';
import { PLANET_IDS, type PlanetId } from './orbitalConstants';
import type { TourFinish } from './tour';

export interface ShareState {
  departPlanet: PlanetId;
  arrivePlanet: PlanetId;
  departRange: [number, number];
  arriveRange: [number, number];
  arrivalAuto: boolean;
  metric: string;
  palette: string;
  aerocapture: boolean;
  rocketId: string;
  prograde: boolean;
  maxRevs: number;
  lockedDepartMs: number | null;
  lockedArriveMs: number | null;
  // grand-tour mode (all present when mode === 'tour')
  mode?: 'porkchop' | 'tour';
  tourRoute?: PlanetId[];
  tourDepartMs?: number;
  tourLegTofs?: number[];
  tourFinish?: TourFinish;
}

export function encodeShareState(s: ShareState): string {
  const p = new URLSearchParams();
  p.set('from', s.departPlanet);
  p.set('to', s.arrivePlanet);
  if (s.mode === 'tour' && s.tourRoute && s.tourLegTofs && s.tourDepartMs) {
    p.set('mode', 'tour');
    p.set('tr', s.tourRoute.join('.'));
    p.set('td', isoDate(s.tourDepartMs));
    p.set('tt', s.tourLegTofs.map((t) => Math.round(t)).join('.'));
    if (s.tourFinish && s.tourFinish !== 'capture') p.set('tf', s.tourFinish);
  }
  p.set('d0', isoDate(s.departRange[0]));
  p.set('d1', isoDate(s.departRange[1]));
  p.set('a0', isoDate(s.arriveRange[0]));
  p.set('a1', isoDate(s.arriveRange[1]));
  if (!s.arrivalAuto) p.set('af', '1');
  if (s.metric !== 'dv') p.set('m', s.metric);
  if (s.palette !== 'turbo') p.set('pal', s.palette);
  if (s.aerocapture) p.set('ac', '1');
  if (s.rocketId !== 'falconHeavy') p.set('rk', s.rocketId);
  if (!s.prograde) p.set('pg', '0');
  if (s.maxRevs > 0) p.set('mr', String(s.maxRevs));
  if (s.lockedDepartMs && s.lockedArriveMs) {
    p.set('ld', isoDate(s.lockedDepartMs));
    p.set('la', isoDate(s.lockedArriveMs));
  }
  return p.toString();
}

const parseDate = (v: string | null): number | null => {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
};

const isPlanet = (v: string | null): v is PlanetId =>
  !!v && (PLANET_IDS as readonly string[]).includes(v);

export function decodeShareState(search: string): Partial<ShareState> | null {
  const p = new URLSearchParams(search);
  if (!p.has('from') && !p.has('to')) return null;
  const out: Partial<ShareState> = {};
  const from = p.get('from');
  const to = p.get('to');
  if (isPlanet(from)) out.departPlanet = from;
  if (isPlanet(to) && to !== out.departPlanet) out.arrivePlanet = to;
  const d0 = parseDate(p.get('d0'));
  const d1 = parseDate(p.get('d1'));
  if (d0 !== null && d1 !== null && d1 > d0) out.departRange = [d0, d1];
  const a0 = parseDate(p.get('a0'));
  const a1 = parseDate(p.get('a1'));
  if (a0 !== null && a1 !== null && a1 > a0) out.arriveRange = [a0, a1];
  if (p.get('af') === '1') out.arrivalAuto = false;
  const m = p.get('m');
  if (m === 'tof' || m === 'c3') out.metric = m;
  const pal = p.get('pal');
  if (pal) out.palette = pal;
  if (p.get('ac') === '1') out.aerocapture = true;
  const rk = p.get('rk');
  if (rk) out.rocketId = rk;
  if (p.get('pg') === '0') out.prograde = false;
  const mr = Number(p.get('mr'));
  if (mr === 1 || mr === 2) out.maxRevs = mr;
  const ld = parseDate(p.get('ld'));
  const la = parseDate(p.get('la'));
  if (ld !== null && la !== null && la > ld) {
    out.lockedDepartMs = ld;
    out.lockedArriveMs = la;
  }

  // grand-tour state — only accepted as a complete, consistent set
  if (p.get('mode') === 'tour') {
    const route = (p.get('tr') ?? '').split('.');
    const tofs = (p.get('tt') ?? '').split('.').map(Number);
    const td = parseDate(p.get('td'));
    const routeOk =
      route.length >= 2 &&
      route.length <= 6 &&
      route.every(isPlanet) &&
      route.every((r, i) => i === 0 || r !== route[i - 1]);
    const tofsOk = tofs.length === route.length - 1 && tofs.every((t) => Number.isFinite(t) && t > 2);
    if (routeOk && tofsOk && td !== null) {
      out.mode = 'tour';
      out.tourRoute = route as PlanetId[];
      out.tourLegTofs = tofs.map(Math.round);
      out.tourDepartMs = td;
      const tf = p.get('tf');
      if (tf === 'aerocapture' || tf === 'flyby') out.tourFinish = tf;
      else out.tourFinish = 'capture';
    }
  }
  return out;
}
