// Gravitational parameters (km³/s²) and planet reference data.
// μ values are the exact figures specified for this tool; positions always
// come from astronomy-engine, never from the approximate elements below.

export const MU_SUN = 132_712_440_018; // km³/s²

export const PLANET_IDS = [
  'Mercury',
  'Venus',
  'Earth',
  'Mars',
  'Jupiter',
  'Saturn',
  'Uranus',
  'Neptune',
] as const;

export type PlanetId = (typeof PLANET_IDS)[number];

export interface PlanetInfo {
  id: PlanetId;
  mu: number; // km³/s²
  radiusKm: number; // mean equatorial radius
  /** Altitude of the reference parking/capture orbit periapsis, km above surface. */
  parkingAltKm: number;
  /**
   * Apoapsis radius of the reference capture orbit as a multiple of periapsis
   * radius. 1 = circular capture (terrestrial planets). Gas giants use a
   * high-ellipse capture orbit — circularizing deep in a giant's well costs
   * tens of km/s and no real mission does it.
   */
  captureApoRatio: number;
  /** Usable atmosphere for aerocapture/aerobraking. */
  hasAtmosphere: boolean;
  /** Approximate elements — sanity-check/display only. */
  semiMajorAxisAu: number;
  periodYears: number;
  eccentricity: number;
  /** Display color for UI/3D. */
  color: string;
}

export const PLANETS: Record<PlanetId, PlanetInfo> = {
  Mercury: {
    id: 'Mercury',
    mu: 22_032,
    radiusKm: 2439.7,
    parkingAltKm: 200,
    captureApoRatio: 1,
    hasAtmosphere: false,
    semiMajorAxisAu: 0.387,
    periodYears: 0.241,
    eccentricity: 0.206,
    color: '#b5a89b',
  },
  Venus: {
    id: 'Venus',
    mu: 324_859,
    radiusKm: 6051.8,
    parkingAltKm: 300,
    captureApoRatio: 1,
    hasAtmosphere: true,
    semiMajorAxisAu: 0.723,
    periodYears: 0.615,
    eccentricity: 0.007,
    color: '#e8c88a',
  },
  Earth: {
    id: 'Earth',
    mu: 398_600,
    radiusKm: 6371.0,
    parkingAltKm: 200,
    captureApoRatio: 1,
    hasAtmosphere: true,
    semiMajorAxisAu: 1.0,
    periodYears: 1.0,
    eccentricity: 0.017,
    color: '#4f9df0',
  },
  Mars: {
    id: 'Mars',
    mu: 42_828,
    radiusKm: 3389.5,
    parkingAltKm: 300,
    captureApoRatio: 1,
    hasAtmosphere: true,
    semiMajorAxisAu: 1.524,
    periodYears: 1.881,
    eccentricity: 0.093,
    color: '#e0704a',
  },
  Jupiter: {
    id: 'Jupiter',
    mu: 126_686_534,
    radiusKm: 69_911,
    parkingAltKm: 5000,
    captureApoRatio: 30,
    hasAtmosphere: true,
    semiMajorAxisAu: 5.203,
    periodYears: 11.86,
    eccentricity: 0.048,
    color: '#d9a06c',
  },
  Saturn: {
    id: 'Saturn',
    mu: 37_931_187,
    radiusKm: 58_232,
    parkingAltKm: 4000,
    captureApoRatio: 30,
    hasAtmosphere: true,
    semiMajorAxisAu: 9.537,
    periodYears: 29.45,
    eccentricity: 0.056,
    color: '#e3c887',
  },
  Uranus: {
    id: 'Uranus',
    mu: 5_793_939,
    radiusKm: 25_362,
    parkingAltKm: 3000,
    captureApoRatio: 20,
    hasAtmosphere: true,
    semiMajorAxisAu: 19.19,
    periodYears: 84.02,
    eccentricity: 0.047,
    color: '#8fd3e0',
  },
  Neptune: {
    id: 'Neptune',
    mu: 6_836_529,
    radiusKm: 24_622,
    parkingAltKm: 3000,
    captureApoRatio: 20,
    hasAtmosphere: true,
    semiMajorAxisAu: 30.07,
    periodYears: 164.8,
    eccentricity: 0.009,
    color: '#5a7de8',
  },
};

export const DAY_MS = 86_400_000;
export const DAY_S = 86_400;

/** Earth–Mars synodic period, days — used for default window suggestions. */
export const EARTH_MARS_SYNODIC_DAYS = 780;
