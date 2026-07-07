import { isoDate } from './format';
import type { PorkchopGrid } from './porkchop';

/** Serialize the full grid to CSV (finite cells only). */
export function gridToCsv(grid: PorkchopGrid): string {
  const rows: string[] = [
    'departure_date,arrival_date,tof_days,total_dv_kms,departure_c3_km2s2,departure_vinf_kms,arrival_vinf_kms',
  ];
  const nDep = grid.departDatesMs.length;
  for (let iArr = 0; iArr < grid.arriveDatesMs.length; iArr++) {
    for (let iDep = 0; iDep < nDep; iDep++) {
      const idx = iArr * nDep + iDep;
      const dv = grid.totalDv[idx];
      if (!Number.isFinite(dv)) continue;
      rows.push(
        [
          isoDate(grid.departDatesMs[iDep]),
          isoDate(grid.arriveDatesMs[iArr]),
          grid.tofDays[idx].toFixed(1),
          dv.toFixed(4),
          grid.depC3[idx].toFixed(3),
          grid.depVinf[idx].toFixed(4),
          grid.arrVinf[idx].toFixed(4),
        ].join(','),
      );
    }
  }
  return rows.join('\n');
}

export function downloadText(filename: string, text: string, mime = 'text/csv') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
