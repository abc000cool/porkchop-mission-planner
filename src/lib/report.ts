// One-page PDF mission report, drawn natively with jsPDF in the app's
// mission-control style. Embeds the live porkchop canvas and the transfer
// geometry as vector art — no html2canvas rasterization needed.

import { jsPDF } from 'jspdf';
import type { Difficulty } from './difficulty';
import { fmtDate, fmtNum, isoDate } from './format';
import { arrivalTradeTable, type Mission } from './mission';
import { PLANETS } from './orbitalConstants';
import { payloadForC3, type RocketDef } from './rocketData';
import type { TourEvaluation } from './tour';
import type { Vec3 } from './vec';

const AU = 149_597_870.7;

export interface ReportInputs {
  mission: Mission;
  rocket: RocketDef;
  difficulty: Difficulty | null;
  aerocapture: boolean;
  plotCanvas: HTMLCanvasElement | null;
  shareUrl: string;
}

const BG: [number, number, number] = [8, 8, 14];
const PANEL: [number, number, number] = [16, 16, 24];
const TEXT: [number, number, number] = [232, 236, 244];
const MID: [number, number, number] = [140, 150, 170];
const ACCENT: [number, number, number] = [58, 176, 255];
const AMBER: [number, number, number] = [255, 179, 71];

export function generateMissionReport({
  mission,
  rocket,
  difficulty,
  aerocapture,
  plotCanvas,
  shareUrl,
}: ReportInputs) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  const H = 297;

  doc.setFillColor(...BG);
  doc.rect(0, 0, W, H, 'F');

  // header
  doc.setTextColor(...TEXT);
  doc.setFont('courier', 'bold');
  doc.setFontSize(16);
  doc.text('PORKCHOP_  MISSION REPORT', 14, 18);
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(0.6);
  doc.line(14, 21, W - 14, 21);

  doc.setFontSize(11);
  doc.setTextColor(...ACCENT);
  doc.text(mission.departPlanet.toUpperCase(), 14, 28);
  doc.setTextColor(...MID);
  doc.text('->', 14 + doc.getTextWidth(mission.departPlanet.toUpperCase()) + 2, 28);
  doc.setTextColor(...AMBER);
  doc.text(
    mission.arrivePlanet.toUpperCase(),
    14 + doc.getTextWidth(mission.departPlanet.toUpperCase() + ' -> ') + 2,
    28,
  );
  doc.setFontSize(8);
  doc.setTextColor(...MID);
  doc.setFont('courier', 'normal');
  doc.text(`generated ${isoDate(Date.now())} · porkchop-mission-planner.vercel.app`, W - 14, 28, {
    align: 'right',
  });

  // key numbers panel
  const rows: [string, string][] = [
    ['DEPARTURE', fmtDate(mission.departMs)],
    ['ARRIVAL', fmtDate(mission.arriveMs)],
    ['FLIGHT TIME', `${Math.round(mission.tofDays)} days`],
    ['DEPARTURE C3', `${fmtNum(mission.depC3, 2)} km2/s2`],
    ['DEPARTURE v-inf', `${fmtNum(mission.depVinf)} km/s`],
    ['ARRIVAL v-inf', `${fmtNum(mission.arrVinf)} km/s`],
    [
      'DEPARTURE BURN',
      `${fmtNum(mission.dvDepart)} km/s (${PLANETS[mission.departPlanet].parkingAltKm} km parking orbit)`,
    ],
    [
      'CAPTURE BURN',
      aerocapture ? '0.00 km/s (aerocapture)' : `${fmtNum(mission.dvCapture)} km/s`,
    ],
    ['TOTAL DELTA-V', `${fmtNum(mission.dvTotal)} km/s`],
  ];
  if (difficulty) {
    rows.push(['DIFFICULTY', `${difficulty.score}/100 (${difficulty.label.toUpperCase()})`]);
    rows.push(['WINDOW WIDTH', `~${Math.round(difficulty.windowDays)} days`]);
  }
  const payload = payloadForC3(rocket, mission.depC3);
  rows.push([
    `PAYLOAD (${rocket.short})`,
    payload === null ? 'C3 beyond vehicle capability' : `${Math.round(payload).toLocaleString()} kg (approx.)`,
  ]);

  doc.setFillColor(...PANEL);
  doc.roundedRect(14, 34, 88, 8 + rows.length * 6.4, 2, 2, 'F');
  doc.setFontSize(8.2);
  rows.forEach(([k, v], i) => {
    const y = 41 + i * 6.4;
    doc.setTextColor(...MID);
    doc.text(k, 18, y);
    doc.setTextColor(...(k === 'TOTAL DELTA-V' ? AMBER : TEXT));
    doc.text(v, 98, y, { align: 'right' });
  });

  // transfer geometry (vector, top-down ecliptic)
  const gx = 108;
  const gy = 34;
  const gs = 88;
  doc.setFillColor(...PANEL);
  doc.roundedRect(gx, gy, gs, gs, 2, 2, 'F');
  {
    const all: Vec3[] = [
      ...(mission.orbitLoops[mission.departPlanet] ?? []),
      ...(mission.orbitLoops[mission.arrivePlanet] ?? []),
      ...mission.trajectory,
    ];
    let maxR = 1e-9;
    for (const p of all) maxR = Math.max(maxR, Math.hypot(p[0], p[1]) / AU);
    const k = (gs / 2 - 5) / maxR;
    const cx = gx + gs / 2;
    const cy = gy + gs / 2;
    const px = (v: Vec3): [number, number] => [cx + (v[0] / AU) * k, cy - (v[1] / AU) * k];
    const drawPath = (pts: Vec3[], rgb: [number, number, number], lw: number) => {
      doc.setDrawColor(...rgb);
      doc.setLineWidth(lw);
      for (let i = 1; i < pts.length; i++) {
        const a = px(pts[i - 1]);
        const b = px(pts[i]);
        doc.line(a[0], a[1], b[0], b[1]);
      }
    };
    drawPath(mission.orbitLoops[mission.departPlanet] ?? [], [70, 90, 120], 0.25);
    drawPath(mission.orbitLoops[mission.arrivePlanet] ?? [], [120, 80, 60], 0.25);
    drawPath(mission.trajectory, ACCENT, 0.55);
    // sun + endpoints
    doc.setFillColor(...AMBER);
    doc.circle(cx, cy, 1.2, 'F');
    const dp = px(mission.trajectory[0]);
    const ap = px(mission.trajectory[mission.trajectory.length - 1]);
    doc.setFillColor(79, 157, 240);
    doc.circle(dp[0], dp[1], 1.1, 'F');
    doc.setFillColor(224, 112, 74);
    doc.circle(ap[0], ap[1], 1.1, 'F');
    doc.setFontSize(6.5);
    doc.setTextColor(...MID);
    doc.text('DEP', dp[0] + 2, dp[1] + 1);
    doc.text('ARR', ap[0] + 2, ap[1] + 1);
    doc.text('heliocentric ecliptic J2000 · top-down', gx + 3, gy + gs - 3);
  }

  // porkchop plot snapshot
  let y = 34 + Math.max(8 + rows.length * 6.4, gs) + 8;
  if (plotCanvas && plotCanvas.width > 0) {
    const img = plotCanvas.toDataURL('image/png');
    const iw = W - 28;
    const ih = (plotCanvas.height / plotCanvas.width) * iw;
    const maxH = 92;
    const scale = Math.min(1, maxH / ih);
    doc.setFillColor(...PANEL);
    doc.roundedRect(14, y, iw * scale + 4, ih * scale + 4, 2, 2, 'F');
    doc.addImage(img, 'PNG', 16, y + 2, iw * scale, ih * scale);
    doc.setFontSize(6.5);
    doc.setTextColor(...MID);
    doc.text('delta-v porkchop plot (departure vs arrival date)', 16, y + ih * scale + 8);
    y += ih * scale + 14;
  }

  // arrival trade table
  const trade = arrivalTradeTable(mission, aerocapture);
  if (trade.length > 1 && y < H - 50) {
    doc.setFontSize(8);
    doc.setTextColor(...ACCENT);
    doc.text('ARRIVAL TRADE — C3 vs v-inf', 14, y + 4);
    doc.setFontSize(7.5);
    doc.setTextColor(...MID);
    const cols = [14, 52, 86, 120, 154];
    doc.text('ARRIVAL', cols[0], y + 10);
    doc.text('TOF d', cols[1], y + 10);
    doc.text('C3 km2/s2', cols[2], y + 10);
    doc.text('v-inf km/s', cols[3], y + 10);
    doc.text('DV km/s', cols[4], y + 10);
    trade.forEach((t, i) => {
      const ty = y + 15 + i * 4.6;
      doc.setTextColor(...(t.offsetDays === 0 ? ACCENT : TEXT));
      doc.text(fmtDate(t.arriveMs) + (t.offsetDays === 0 ? ' *' : ''), cols[0], ty);
      doc.text(String(Math.round(t.tofDays)), cols[1], ty);
      doc.text(fmtNum(t.depC3, 1), cols[2], ty);
      doc.text(fmtNum(t.arrVinf, 2), cols[3], ty);
      doc.text(fmtNum(t.dvTotal, 2), cols[4], ty);
    });
    y += 15 + trade.length * 4.6 + 4;
  }

  // footer
  doc.setDrawColor(40, 44, 60);
  doc.setLineWidth(0.3);
  doc.line(14, H - 20, W - 14, H - 20);
  doc.setFontSize(6.5);
  doc.setTextColor(...MID);
  doc.text(
    'Izzo Lambert solver · astronomy-engine ephemeris (VSOP87, ecliptic J2000) · launch vehicle figures are representative approximations',
    14,
    H - 15,
  );
  const url = shareUrl.length > 120 ? shareUrl.slice(0, 117) + '...' : shareUrl;
  doc.setTextColor(...ACCENT);
  doc.text(url, 14, H - 10);

  doc.save(
    `mission_${mission.departPlanet}_${mission.arrivePlanet}_${isoDate(mission.departMs)}.pdf`,
  );
}

export interface TourReportInputs {
  evaluation: TourEvaluation;
  /** Assembled tour mission — supplies trajectory/orbits for the geometry panel. */
  mission: Mission;
  shareUrl: string;
}

/** One-page PDF report for a multi-leg grand tour. */
export function generateTourReport({ evaluation, mission, shareUrl }: TourReportInputs) {
  const ev = evaluation;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  const H = 297;

  doc.setFillColor(...BG);
  doc.rect(0, 0, W, H, 'F');

  // header
  doc.setTextColor(...TEXT);
  doc.setFont('courier', 'bold');
  doc.setFontSize(16);
  doc.text('PORKCHOP_  GRAND TOUR REPORT', 14, 18);
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(0.6);
  doc.line(14, 21, W - 14, 21);

  doc.setFontSize(11);
  let rx = 14;
  ev.route.forEach((pl, i) => {
    if (i > 0) {
      doc.setTextColor(...MID);
      doc.text('->', rx, 28);
      rx += doc.getTextWidth('->') + 2;
    }
    doc.setTextColor(...(i === 0 || i === ev.route.length - 1 ? AMBER : ACCENT));
    doc.text(pl.toUpperCase(), rx, 28);
    rx += doc.getTextWidth(pl.toUpperCase()) + 2;
  });
  doc.setFontSize(8);
  doc.setTextColor(...MID);
  doc.setFont('courier', 'normal');
  doc.text(`generated ${isoDate(Date.now())} · porkchop-mission-planner.vercel.app`, W - 14, 28, {
    align: 'right',
  });

  // key numbers panel
  const finishLabel =
    ev.finish === 'flyby'
      ? 'flyby — no capture'
      : ev.finish === 'aerocapture'
        ? `aerocapture at ${ev.route[ev.route.length - 1]}`
        : `capture at ${ev.route[ev.route.length - 1]}`;
  const rows: [string, string][] = [
    ['DEPARTURE', fmtDate(ev.departMs)],
    ['FINAL ENCOUNTER', fmtDate(ev.legs[ev.legs.length - 1].arriveMs)],
    [
      'TOTAL FLIGHT',
      `${Math.round(ev.totalTofDays).toLocaleString()} days (${(ev.totalTofDays / 365.25).toFixed(1)} yr)`,
    ],
    ['LAUNCH C3', `${fmtNum(ev.depC3, 1)} km2/s2`],
    ['DEPARTURE v-inf', `${fmtNum(ev.depVinf)} km/s`],
    [
      'DEPARTURE BURN',
      `${fmtNum(ev.dvDepart)} km/s (${PLANETS[ev.route[0]].parkingAltKm} km parking orbit)`,
    ],
    ['FLYBY PENALTIES', `${fmtNum(ev.dvFlybys)} km/s (${ev.flybys.length} assists)`],
    ['FINISH', finishLabel],
    ['CAPTURE BURN', ev.finish === 'flyby' ? '—' : `${fmtNum(ev.dvCapture)} km/s`],
    ['TOTAL DELTA-V', `${fmtNum(ev.dvTotal)} km/s`],
  ];

  doc.setFillColor(...PANEL);
  doc.roundedRect(14, 34, 88, 8 + rows.length * 6.4, 2, 2, 'F');
  doc.setFontSize(8.2);
  rows.forEach(([k, v], i) => {
    const y = 41 + i * 6.4;
    doc.setTextColor(...MID);
    doc.text(k, 18, y);
    doc.setTextColor(...(k === 'TOTAL DELTA-V' ? AMBER : TEXT));
    doc.text(v, 98, y, { align: 'right' });
  });

  // tour geometry (vector, top-down ecliptic): all route orbits + trajectory
  const gx = 108;
  const gy = 34;
  const gs = 88;
  doc.setFillColor(...PANEL);
  doc.roundedRect(gx, gy, gs, gs, 2, 2, 'F');
  {
    const all: Vec3[] = [
      ...ev.route.flatMap((pl) => mission.orbitLoops[pl] ?? []),
      ...mission.trajectory,
    ];
    let maxR = 1e-9;
    for (const p of all) maxR = Math.max(maxR, Math.hypot(p[0], p[1]) / AU);
    const k = (gs / 2 - 5) / maxR;
    const cx = gx + gs / 2;
    const cy = gy + gs / 2;
    const px = (v: Vec3): [number, number] => [cx + (v[0] / AU) * k, cy - (v[1] / AU) * k];
    const drawPath = (pts: Vec3[], rgb: [number, number, number], lw: number) => {
      doc.setDrawColor(...rgb);
      doc.setLineWidth(lw);
      for (let i = 1; i < pts.length; i++) {
        const a = px(pts[i - 1]);
        const b = px(pts[i]);
        doc.line(a[0], a[1], b[0], b[1]);
      }
    };
    for (const pl of ev.route) drawPath(mission.orbitLoops[pl] ?? [], [70, 90, 120], 0.22);
    drawPath(mission.trajectory, ACCENT, 0.55);
    doc.setFillColor(...AMBER);
    doc.circle(cx, cy, 1.2, 'F');
    // encounter markers along the trajectory
    doc.setFontSize(6);
    const totalMs = mission.arriveMs - mission.departMs;
    const markers = [
      { ms: mission.departMs, label: ev.route[0].slice(0, 3).toUpperCase() },
      ...ev.flybys.map((f) => ({ ms: f.ms, label: f.planet.slice(0, 3).toUpperCase() })),
      { ms: mission.arriveMs, label: ev.route[ev.route.length - 1].slice(0, 3).toUpperCase() },
    ];
    for (const mk of markers) {
      const frac = (mk.ms - mission.departMs) / totalMs;
      const idx = Math.min(
        mission.trajectory.length - 1,
        Math.max(0, Math.round(frac * (mission.trajectory.length - 1))),
      );
      const pt = px(mission.trajectory[idx]);
      doc.setFillColor(...ACCENT);
      doc.circle(pt[0], pt[1], 0.9, 'F');
      doc.setTextColor(...MID);
      doc.text(mk.label, pt[0] + 1.6, pt[1] + 0.8);
    }
    doc.setTextColor(...MID);
    doc.setFontSize(6.5);
    doc.text('heliocentric ecliptic J2000 · top-down', gx + 3, gy + gs - 3);
  }

  let y = 34 + Math.max(8 + rows.length * 6.4, gs) + 10;

  // legs table
  doc.setFontSize(8);
  doc.setTextColor(...ACCENT);
  doc.text('LEGS', 14, y);
  doc.setFontSize(7.5);
  doc.setTextColor(...MID);
  const lc = [14, 60, 100, 140];
  doc.text('LEG', lc[0], y + 5.5);
  doc.text('DEPART', lc[1], y + 5.5);
  doc.text('ARRIVE', lc[2], y + 5.5);
  doc.text('TOF d', lc[3], y + 5.5);
  ev.legs.forEach((leg, i) => {
    const ty = y + 10.5 + i * 4.6;
    doc.setTextColor(...TEXT);
    doc.text(`${leg.from} -> ${leg.to}`, lc[0], ty);
    doc.text(fmtDate(leg.departMs), lc[1], ty);
    doc.text(fmtDate(leg.arriveMs), lc[2], ty);
    doc.text(String(Math.round(leg.tofDays)), lc[3], ty);
  });
  y += 10.5 + ev.legs.length * 4.6 + 8;

  // gravity assists table
  if (ev.flybys.length > 0) {
    doc.setFontSize(8);
    doc.setTextColor(...ACCENT);
    doc.text('GRAVITY ASSISTS (patched-conic)', 14, y);
    doc.setFontSize(7.5);
    doc.setTextColor(...MID);
    const fc = [14, 44, 76, 106, 136, 166];
    doc.text('PLANET', fc[0], y + 5.5);
    doc.text('DATE', fc[1], y + 5.5);
    doc.text('v-inf i/o km/s', fc[2], y + 5.5);
    doc.text('TURN req/max', fc[3], y + 5.5);
    doc.text('PERIAPSIS km', fc[4], y + 5.5);
    doc.text('DV km/s', fc[5], y + 5.5);
    ev.flybys.forEach((fb, i) => {
      const ty = y + 10.5 + i * 4.6;
      doc.setTextColor(...TEXT);
      doc.text(fb.planet, fc[0], ty);
      doc.text(fmtDate(fb.ms), fc[1], ty);
      doc.text(`${fmtNum(fb.vinfIn, 1)}/${fmtNum(fb.vinfOut, 1)}`, fc[2], ty);
      doc.text(`${fb.turnReqDeg.toFixed(0)}/${fb.turnMaxDeg.toFixed(0)} deg`, fc[3], ty);
      doc.text(Math.round(fb.altKm).toLocaleString(), fc[4], ty);
      doc.setTextColor(...(fb.dv < 0.1 ? MID : AMBER));
      doc.text(fb.ballistic ? 'ballistic' : fmtNum(fb.dv), fc[5], ty);
    });
    y += 10.5 + ev.flybys.length * 4.6 + 4;
  }

  // footer
  doc.setDrawColor(40, 44, 60);
  doc.setLineWidth(0.3);
  doc.line(14, H - 20, W - 14, H - 20);
  doc.setFontSize(6.5);
  doc.setTextColor(...MID);
  doc.text(
    'Izzo Lambert legs · patched-conic flybys (turn bought with periapsis depth, min safe altitude enforced) · preliminary design, not ops-grade',
    14,
    H - 15,
  );
  const url = shareUrl.length > 120 ? shareUrl.slice(0, 117) + '...' : shareUrl;
  doc.setTextColor(...ACCENT);
  doc.text(url, 14, H - 10);

  doc.save(`grandtour_${ev.route.join('-')}_${isoDate(ev.departMs)}.pdf`);
}
