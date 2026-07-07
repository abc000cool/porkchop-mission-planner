// Launch vehicle C3 vs injected-mass performance curves.
//
// IMPORTANT: these are REPRESENTATIVE APPROXIMATIONS assembled from public
// figures (NASA Launch Services Program performance site, manufacturer
// payload guides, published mission masses). They are for mission-study
// purposes, not authoritative engineering data — and the UI labels them so.

export interface RocketDef {
  id: string;
  name: string;
  short: string;
  color: string;
  note: string;
  /** [C3 km²/s², injected mass kg] points, ascending C3, linear interpolation. */
  curve: [number, number][];
}

export const ROCKETS: RocketDef[] = [
  {
    id: 'falcon9',
    name: 'Falcon 9 (expendable)',
    short: 'F9',
    color: '#9aa3b5',
    note: 'approx. from NASA LSP query data',
    curve: [
      [0, 4000],
      [10, 3350],
      [20, 2700],
      [30, 2050],
      [40, 1400],
      [50, 750],
    ],
  },
  {
    id: 'falconHeavy',
    name: 'Falcon Heavy (expendable)',
    short: 'FH',
    color: '#3ab0ff',
    note: 'approx.; Europa Clipper flew ~6.1 t at C3≈41',
    curve: [
      [0, 15000],
      [10, 12300],
      [20, 10000],
      [30, 8000],
      [40, 6100],
      [50, 4400],
      [60, 2900],
      [70, 1700],
      [80, 700],
      [90, 150],
    ],
  },
  {
    id: 'sls1',
    name: 'SLS Block 1',
    short: 'SLS',
    color: '#ffb347',
    note: 'approx.; ~27 t trans-lunar (C3≈−0.9)',
    curve: [
      [0, 26500],
      [10, 22300],
      [20, 18400],
      [30, 14700],
      [40, 11200],
      [50, 8000],
      [60, 5200],
      [70, 2800],
      [80, 900],
    ],
  },
  {
    id: 'starship',
    name: 'Starship (orbital refueling)',
    short: 'SS',
    color: '#e0704a',
    note: 'projected, assumes full LEO refuel — highly approximate',
    curve: [
      [0, 100000],
      [10, 95000],
      [20, 82000],
      [30, 66000],
      [40, 50000],
      [60, 26000],
      [80, 10000],
      [100, 2000],
    ],
  },
];

export const ROCKET_BY_ID = Object.fromEntries(ROCKETS.map((r) => [r.id, r])) as Record<
  string,
  RocketDef
>;

/** Injected mass at a given C3, kg. null when the vehicle cannot reach that C3. */
export function payloadForC3(rocket: RocketDef, c3: number): number | null {
  const pts = rocket.curve;
  if (c3 < pts[0][0]) return pts[0][1];
  const last = pts[pts.length - 1];
  if (c3 > last[0]) return null;
  for (let i = 1; i < pts.length; i++) {
    if (c3 <= pts[i][0]) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      return y0 + ((y1 - y0) * (c3 - x0)) / (x1 - x0);
    }
  }
  return last[1];
}

/** Maximum C3 at which the vehicle can still inject `kg`. null if never. */
export function maxC3ForPayload(rocket: RocketDef, kg: number): number | null {
  const pts = rocket.curve;
  if (kg > pts[0][1]) return null;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    if (kg >= y1) {
      return x0 + ((x1 - x0) * (y0 - kg)) / (y0 - y1);
    }
  }
  return pts[pts.length - 1][0];
}
