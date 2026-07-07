// Window-suggestion heuristics: given a planet pair, propose date ranges that
// are guaranteed to contain at least one launch window, and a grid step that
// keeps the Lambert grid at an interactive size.

import { DAY_MS, PLANETS, type PlanetId } from './orbitalConstants';

const YEAR_DAYS = 365.25;
const TARGET_CELLS = 80_000;

/** Hohmann transfer time between two planets' mean orbits, days. */
export function hohmannTofDays(from: PlanetId, to: PlanetId): number {
  const aT = (PLANETS[from].semiMajorAxisAu + PLANETS[to].semiMajorAxisAu) / 2;
  return 0.5 * Math.pow(aT, 1.5) * YEAR_DAYS;
}

/** Synodic period of a planet pair, days. */
export function synodicDays(a: PlanetId, b: PlanetId): number {
  const Ta = PLANETS[a].periodYears;
  const Tb = PLANETS[b].periodYears;
  const inv = Math.abs(1 / Ta - 1 / Tb);
  if (inv < 1e-9) return 780;
  return (1 / inv) * YEAR_DAYS;
}

/**
 * Default departure range: starts now, spans one synodic period (clamped)
 * so at least one optimal window is always inside the plot.
 */
export function suggestDepartureRange(
  from: PlanetId,
  to: PlanetId,
  nowMs: number,
): [number, number] {
  const span = Math.min(Math.max(synodicDays(from, to), 320), 800);
  const start = Math.floor(nowMs / DAY_MS) * DAY_MS;
  return [start, start + Math.round(span) * DAY_MS];
}

/**
 * Arrival range bracketing plausible transfer times: fast transfers down to
 * ~0.35× Hohmann TOF, slow Type-II transfers up to ~2.2× Hohmann TOF.
 */
export function suggestArrivalRange(
  depStartMs: number,
  depEndMs: number,
  from: PlanetId,
  to: PlanetId,
): [number, number] {
  const tH = hohmannTofDays(from, to);
  const minLead = Math.max(30, Math.round(0.35 * tH));
  const maxLead = Math.round(2.2 * tH);
  return [depStartMs + minLead * DAY_MS, depEndMs + maxLead * DAY_MS];
}

/** Grid step (days) keeping cell count near TARGET_CELLS, clamped [1, 15]. */
export function suggestStepDays(
  depStartMs: number,
  depEndMs: number,
  arrStartMs: number,
  arrEndMs: number,
): number {
  const depDays = Math.max(1, (depEndMs - depStartMs) / DAY_MS);
  const arrDays = Math.max(1, (arrEndMs - arrStartMs) / DAY_MS);
  const step = Math.ceil(Math.sqrt((depDays * arrDays) / TARGET_CELLS));
  return Math.min(Math.max(step, 1), 15);
}
