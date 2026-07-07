// One-page PDF mission report, drawn natively with jsPDF in the app's
// mission-control style. Embeds the live porkchop canvas and the transfer
// geometry as vector art — no html2canvas rasterization needed.

import { jsPDF } from 'jspdf';
import type { Difficulty } from './difficulty';
import { fmtDate, fmtNum, isoDate } from './format';
import { arrivalTradeTable, type Mission } from './mission';
import { PLANETS } from './orbitalConstants';
import { payloadForC3, type RocketDef } from './rocketData';
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
